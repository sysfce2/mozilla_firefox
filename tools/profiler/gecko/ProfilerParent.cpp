/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "ProfilerParent.h"

#ifdef MOZ_GECKO_PROFILER
#  include "nsProfiler.h"
#  include "platform.h"
#endif

#include "GeckoProfiler.h"
#include "ProfilerControl.h"
#include "mozilla/BaseAndGeckoProfilerDetail.h"
#include "mozilla/BaseProfilerDetail.h"
#include "mozilla/ClearOnShutdown.h"
#include "mozilla/DataMutex.h"
#include "mozilla/IOInterposer.h"
#include "mozilla/ipc/Endpoint.h"
#include "mozilla/Maybe.h"
#include "mozilla/ProfileBufferControlledChunkManager.h"
#include "mozilla/ProfilerBufferSize.h"
#include "mozilla/RefPtr.h"
#include "mozilla/Unused.h"
#include "nsTArray.h"
#include "nsThreadUtils.h"

#include <utility>

namespace mozilla {

using namespace ipc;

/* static */
Endpoint<PProfilerChild> ProfilerParent::CreateForProcess(
    base::ProcessId aOtherPid) {
  MOZ_RELEASE_ASSERT(NS_IsMainThread());
  Endpoint<PProfilerChild> child;
#ifdef MOZ_GECKO_PROFILER
  Endpoint<PProfilerParent> parent;
  nsresult rv = PProfiler::CreateEndpoints(&parent, &child);

  if (NS_FAILED(rv)) {
    MOZ_CRASH("Failed to create top level actor for PProfiler!");
  }

  RefPtr<ProfilerParent> actor = new ProfilerParent(aOtherPid);
  if (!parent.Bind(actor)) {
    MOZ_CRASH("Failed to bind parent actor for PProfiler!");
  }

  actor->Init();
#endif

  return child;
}

#ifdef MOZ_GECKO_PROFILER

class ProfilerParentTracker;

// This class is responsible for gathering updates from chunk managers in
// different process, and request for the oldest chunks to be destroyed whenever
// the given memory limit is reached.
class ProfileBufferGlobalController final {
 public:
  explicit ProfileBufferGlobalController(size_t aMaximumBytes);

  ~ProfileBufferGlobalController();

  void HandleChildChunkManagerUpdate(
      base::ProcessId aProcessId,
      ProfileBufferControlledChunkManager::Update&& aUpdate);

  static bool IsLockedOnCurrentThread();

 private:
  // Calls aF(Json::Value&).
  template <typename F>
  void Log(F&& aF);

  static void LogUpdateChunks(Json::Value& updates, base::ProcessId aProcessId,
                              const TimeStamp& aTimeStamp, int aChunkDiff);
  void LogUpdate(base::ProcessId aProcessId,
                 const ProfileBufferControlledChunkManager::Update& aUpdate);
  void LogDeletion(base::ProcessId aProcessId, const TimeStamp& aTimeStamp);

  void HandleChunkManagerNonFinalUpdate(
      base::ProcessId aProcessId,
      ProfileBufferControlledChunkManager::Update&& aUpdate,
      ProfileBufferControlledChunkManager& aParentChunkManager);

  const size_t mMaximumBytes;

  const base::ProcessId mParentProcessId = base::GetCurrentProcId();

  struct ParentChunkManagerAndPendingUpdate {
    ProfileBufferControlledChunkManager* mChunkManager = nullptr;
    ProfileBufferControlledChunkManager::Update mPendingUpdate;
  };

  static DataMutexBase<ParentChunkManagerAndPendingUpdate,
                       baseprofiler::detail::BaseProfilerMutex>
      sParentChunkManagerAndPendingUpdate;

  size_t mUnreleasedTotalBytes = 0;

  struct PidAndBytes {
    base::ProcessId mProcessId;
    size_t mBytes;

    // For searching and sorting.
    bool operator==(base::ProcessId aSearchedProcessId) const {
      return mProcessId == aSearchedProcessId;
    }
    bool operator==(const PidAndBytes& aOther) const {
      return mProcessId == aOther.mProcessId;
    }
    bool operator<(base::ProcessId aSearchedProcessId) const {
      return mProcessId < aSearchedProcessId;
    }
    bool operator<(const PidAndBytes& aOther) const {
      return mProcessId < aOther.mProcessId;
    }
  };
  using PidAndBytesArray = nsTArray<PidAndBytes>;
  PidAndBytesArray mUnreleasedBytesByPid;

  size_t mReleasedTotalBytes = 0;

  struct TimeStampAndBytesAndPid {
    TimeStamp mTimeStamp;
    size_t mBytes;
    base::ProcessId mProcessId;

    // For searching and sorting.
    bool operator==(const TimeStampAndBytesAndPid& aOther) const {
      // Sort first by timestamps, and then by pid in rare cases with the same
      // timestamps.
      return mTimeStamp == aOther.mTimeStamp && mProcessId == aOther.mProcessId;
    }
    bool operator<(const TimeStampAndBytesAndPid& aOther) const {
      // Sort first by timestamps, and then by pid in rare cases with the same
      // timestamps.
      return mTimeStamp < aOther.mTimeStamp ||
             (MOZ_UNLIKELY(mTimeStamp == aOther.mTimeStamp) &&
              mProcessId < aOther.mProcessId);
    }
  };
  using TimeStampAndBytesAndPidArray = nsTArray<TimeStampAndBytesAndPid>;
  TimeStampAndBytesAndPidArray mReleasedChunksByTime;
};

/* static */
MOZ_RUNINIT DataMutexBase<
    ProfileBufferGlobalController::ParentChunkManagerAndPendingUpdate,
    baseprofiler::detail::BaseProfilerMutex>
    ProfileBufferGlobalController::sParentChunkManagerAndPendingUpdate{
        "ProfileBufferGlobalController::sParentChunkManagerAndPendingUpdate"};

// This singleton class tracks live ProfilerParent's (meaning there's a current
// connection with a child process).
// It also knows when the local profiler is running.
// And when both the profiler is running and at least one child is present, it
// creates a ProfileBufferGlobalController and forwards chunk updates to it.
class ProfilerParentTracker final {
 public:
  static void StartTracking(ProfilerParent* aParent);
  static void StopTracking(ProfilerParent* aParent);

  static void ProfilerStarted(uint32_t aEntries);
  static void ProfilerWillStopIfStarted();

  // Number of non-destroyed tracked ProfilerParents.
  static size_t ProfilerParentCount();

  template <typename FuncType>
  static void Enumerate(FuncType&& aIterFunc);

  template <typename FuncType>
  static void ForChild(base::ProcessId aChildPid, FuncType&& aIterFunc);

  static void ForwardChildChunkManagerUpdate(
      base::ProcessId aProcessId,
      ProfileBufferControlledChunkManager::Update&& aUpdate);

  ProfilerParentTracker();
  ~ProfilerParentTracker();

 private:
  // Get the singleton instance; Create one on the first request, unless we are
  // past XPCOMShutdownThreads, which is when it should get destroyed.
  static ProfilerParentTracker* GetInstance();

  // List of parents for currently-connected child processes.
  nsTArray<ProfilerParent*> mProfilerParents;

  // If non-0, the parent profiler is running, with this limit (in number of
  // entries.) This is needed here, because the parent profiler may start
  // running before child processes are known (e.g., startup profiling).
  uint32_t mEntries = 0;

  // When the profiler is running and there is at least one parent-child
  // connection, this is the controller that should receive chunk updates.
  Maybe<ProfileBufferGlobalController> mMaybeController;
};

template <typename F>
void ProfileBufferGlobalController::Log(F&& aF) {
  ProfilingLog::Access([&](Json::Value& aLog) {
    Json::Value& root = aLog[Json::StaticString{"bufferGlobalController"}];
    if (!root.isObject()) {
      root = Json::Value(Json::objectValue);
      root[Json::StaticString{"logBegin" TIMESTAMP_JSON_SUFFIX}] =
          ProfilingLog::Timestamp();
    }
    std::forward<F>(aF)(root);
  });
}

/* static */
void ProfileBufferGlobalController::LogUpdateChunks(Json::Value& updates,
                                                    base::ProcessId aProcessId,
                                                    const TimeStamp& aTimeStamp,
                                                    int aChunkDiff) {
  MOZ_ASSERT(updates.isArray());
  Json::Value row{Json::arrayValue};
  row.append(Json::Value{Json::UInt64(aProcessId)});
  row.append(ProfilingLog::Timestamp(aTimeStamp));
  row.append(Json::Value{Json::Int(aChunkDiff)});
  updates.append(std::move(row));
}

void ProfileBufferGlobalController::LogUpdate(
    base::ProcessId aProcessId,
    const ProfileBufferControlledChunkManager::Update& aUpdate) {
  Log([&](Json::Value& aRoot) {
    Json::Value& updates = aRoot[Json::StaticString{"updates"}];
    if (!updates.isArray()) {
      aRoot[Json::StaticString{"updatesSchema"}] =
          Json::StaticString{"0: pid, 1: chunkRelease_TSms, 3: chunkDiff"};
      updates = Json::Value{Json::arrayValue};
    }
    if (aUpdate.IsFinal()) {
      LogUpdateChunks(updates, aProcessId, TimeStamp{}, 0);
    } else if (!aUpdate.IsNotUpdate()) {
      for (const auto& chunk : aUpdate.NewlyReleasedChunksRef()) {
        LogUpdateChunks(updates, aProcessId, chunk.mDoneTimeStamp, 1);
      }
    }
  });
}

void ProfileBufferGlobalController::LogDeletion(base::ProcessId aProcessId,
                                                const TimeStamp& aTimeStamp) {
  Log([&](Json::Value& aRoot) {
    Json::Value& updates = aRoot[Json::StaticString{"updates"}];
    if (!updates.isArray()) {
      updates = Json::Value{Json::arrayValue};
    }
    LogUpdateChunks(updates, aProcessId, aTimeStamp, -1);
  });
}

ProfileBufferGlobalController::ProfileBufferGlobalController(
    size_t aMaximumBytes)
    : mMaximumBytes(aMaximumBytes) {
  MOZ_RELEASE_ASSERT(NS_IsMainThread());

  Log([](Json::Value& aRoot) {
    aRoot[Json::StaticString{"controllerCreationTime" TIMESTAMP_JSON_SUFFIX}] =
        ProfilingLog::Timestamp();
  });

  // This is the local chunk manager for this parent process, so updates can be
  // handled here.
  ProfileBufferControlledChunkManager* parentChunkManager =
      profiler_get_controlled_chunk_manager();

  if (NS_WARN_IF(!parentChunkManager)) {
    Log([](Json::Value& aRoot) {
      aRoot[Json::StaticString{"controllerCreationFailureReason"}] =
          "No parent chunk manager";
    });
    return;
  }

  {
    auto lockedParentChunkManagerAndPendingUpdate =
        sParentChunkManagerAndPendingUpdate.Lock();
    lockedParentChunkManagerAndPendingUpdate->mChunkManager =
        parentChunkManager;
  }

  parentChunkManager->SetUpdateCallback(
      [this](ProfileBufferControlledChunkManager::Update&& aUpdate) {
        MOZ_ASSERT(!aUpdate.IsNotUpdate(),
                   "Update callback should never be given a non-update");
        auto lockedParentChunkManagerAndPendingUpdate =
            sParentChunkManagerAndPendingUpdate.Lock();
        if (aUpdate.IsFinal()) {
          // Final update of the parent.
          // We cannot keep the chunk manager, and there's no point handling
          // updates anymore. Do some cleanup now, to free resources before
          // we're destroyed.
          lockedParentChunkManagerAndPendingUpdate->mChunkManager = nullptr;
          lockedParentChunkManagerAndPendingUpdate->mPendingUpdate.Clear();
          mUnreleasedTotalBytes = 0;
          mUnreleasedBytesByPid.Clear();
          mReleasedTotalBytes = 0;
          mReleasedChunksByTime.Clear();
          return;
        }
        if (!lockedParentChunkManagerAndPendingUpdate->mChunkManager) {
          // No chunk manager, ignore updates.
          return;
        }
        // Special handling of parent non-final updates:
        // These updates are coming from *this* process, and may originate from
        // scopes in any thread where any lock is held, so using other locks (to
        // e.g., dispatch tasks or send IPCs) could trigger a deadlock. Instead,
        // parent updates are stored locally and handled when the next
        // non-parent update needs handling, see HandleChildChunkManagerUpdate.
        lockedParentChunkManagerAndPendingUpdate->mPendingUpdate.Fold(
            std::move(aUpdate));
      });
}

ProfileBufferGlobalController ::~ProfileBufferGlobalController() {
  MOZ_RELEASE_ASSERT(NS_IsMainThread());
  // Extract the parent chunk manager (if still set).
  // This means any update after this will be ignored.
  ProfileBufferControlledChunkManager* parentChunkManager = []() {
    auto lockedParentChunkManagerAndPendingUpdate =
        sParentChunkManagerAndPendingUpdate.Lock();
    lockedParentChunkManagerAndPendingUpdate->mPendingUpdate.Clear();
    return std::exchange(
        lockedParentChunkManagerAndPendingUpdate->mChunkManager, nullptr);
  }();
  if (parentChunkManager) {
    // We had not received a final update yet, so the chunk manager is still
    // valid. Reset the callback in the chunk manager, this will immediately
    // invoke the callback with the final empty update; see handling above.
    parentChunkManager->SetUpdateCallback({});
  }
}

void ProfileBufferGlobalController::HandleChildChunkManagerUpdate(
    base::ProcessId aProcessId,
    ProfileBufferControlledChunkManager::Update&& aUpdate) {
  MOZ_RELEASE_ASSERT(NS_IsMainThread());

  MOZ_ASSERT(aProcessId != mParentProcessId);

  MOZ_ASSERT(!aUpdate.IsNotUpdate(),
             "HandleChildChunkManagerUpdate should not be given a non-update");

  auto lockedParentChunkManagerAndPendingUpdate =
      sParentChunkManagerAndPendingUpdate.Lock();
  if (!lockedParentChunkManagerAndPendingUpdate->mChunkManager) {
    // No chunk manager, ignore updates.
    return;
  }

  if (aUpdate.IsFinal()) {
    // Final update in a child process, remove all traces of that process.
    LogUpdate(aProcessId, aUpdate);
    size_t index = mUnreleasedBytesByPid.BinaryIndexOf(aProcessId);
    if (index != PidAndBytesArray::NoIndex) {
      // We already have a value for this pid.
      PidAndBytes& pidAndBytes = mUnreleasedBytesByPid[index];
      mUnreleasedTotalBytes -= pidAndBytes.mBytes;
      mUnreleasedBytesByPid.RemoveElementAt(index);
    }

    size_t released = 0;
    mReleasedChunksByTime.RemoveElementsBy(
        [&released, aProcessId](const auto& chunk) {
          const bool match = chunk.mProcessId == aProcessId;
          if (match) {
            released += chunk.mBytes;
          }
          return match;
        });
    if (released != 0) {
      mReleasedTotalBytes -= released;
    }

    // Total can only have gone down, so there's no need to check the limit.
    return;
  }

  // Non-final update in child process.

  // Before handling the child update, we may have pending updates from the
  // parent, which can be processed now since we're in an IPC callback outside
  // of any profiler-related scope.
  if (!lockedParentChunkManagerAndPendingUpdate->mPendingUpdate.IsNotUpdate()) {
    MOZ_ASSERT(
        !lockedParentChunkManagerAndPendingUpdate->mPendingUpdate.IsFinal());
    HandleChunkManagerNonFinalUpdate(
        mParentProcessId,
        std::move(lockedParentChunkManagerAndPendingUpdate->mPendingUpdate),
        *lockedParentChunkManagerAndPendingUpdate->mChunkManager);
    lockedParentChunkManagerAndPendingUpdate->mPendingUpdate.Clear();
  }

  HandleChunkManagerNonFinalUpdate(
      aProcessId, std::move(aUpdate),
      *lockedParentChunkManagerAndPendingUpdate->mChunkManager);
}

/* static */
bool ProfileBufferGlobalController::IsLockedOnCurrentThread() {
  return sParentChunkManagerAndPendingUpdate.Mutex().IsLockedOnCurrentThread();
}

void ProfileBufferGlobalController::HandleChunkManagerNonFinalUpdate(
    base::ProcessId aProcessId,
    ProfileBufferControlledChunkManager::Update&& aUpdate,
    ProfileBufferControlledChunkManager& aParentChunkManager) {
  MOZ_ASSERT(!aUpdate.IsFinal());
  LogUpdate(aProcessId, aUpdate);

  size_t index = mUnreleasedBytesByPid.BinaryIndexOf(aProcessId);
  if (index != PidAndBytesArray::NoIndex) {
    // We already have a value for this pid.
    PidAndBytes& pidAndBytes = mUnreleasedBytesByPid[index];
    mUnreleasedTotalBytes =
        mUnreleasedTotalBytes - pidAndBytes.mBytes + aUpdate.UnreleasedBytes();
    pidAndBytes.mBytes = aUpdate.UnreleasedBytes();
  } else {
    // New pid.
    mUnreleasedBytesByPid.InsertElementSorted(
        PidAndBytes{aProcessId, aUpdate.UnreleasedBytes()});
    mUnreleasedTotalBytes += aUpdate.UnreleasedBytes();
  }

  size_t destroyedReleased = 0;
  if (!aUpdate.OldestDoneTimeStamp().IsNull()) {
    size_t i = 0;
    for (; i < mReleasedChunksByTime.Length(); ++i) {
      if (mReleasedChunksByTime[i].mTimeStamp >=
          aUpdate.OldestDoneTimeStamp()) {
        break;
      }
    }
    // Here, i is the index of the first item that's at or after
    // aUpdate.mOldestDoneTimeStamp, so chunks from aProcessId before that have
    // been destroyed.
    while (i != 0) {
      --i;
      const TimeStampAndBytesAndPid& item = mReleasedChunksByTime[i];
      if (item.mProcessId == aProcessId) {
        destroyedReleased += item.mBytes;
        mReleasedChunksByTime.RemoveElementAt(i);
      }
    }
  }

  size_t newlyReleased = 0;
  for (const ProfileBufferControlledChunkManager::ChunkMetadata& chunk :
       aUpdate.NewlyReleasedChunksRef()) {
    newlyReleased += chunk.mBufferBytes;
    mReleasedChunksByTime.InsertElementSorted(TimeStampAndBytesAndPid{
        chunk.mDoneTimeStamp, chunk.mBufferBytes, aProcessId});
  }

  mReleasedTotalBytes = mReleasedTotalBytes - destroyedReleased + newlyReleased;

#  ifdef DEBUG
  size_t totalReleased = 0;
  for (const TimeStampAndBytesAndPid& item : mReleasedChunksByTime) {
    totalReleased += item.mBytes;
  }
  MOZ_ASSERT(mReleasedTotalBytes == totalReleased);
#  endif  // DEBUG

  std::vector<ProfileBufferControlledChunkManager::ChunkMetadata> toDestroy;
  while (mUnreleasedTotalBytes + mReleasedTotalBytes > mMaximumBytes &&
         !mReleasedChunksByTime.IsEmpty()) {
    // We have reached the global memory limit, and there *are* released chunks
    // that can be destroyed. Start with the first one, which is the oldest.
    const TimeStampAndBytesAndPid& oldest = mReleasedChunksByTime[0];
    LogDeletion(oldest.mProcessId, oldest.mTimeStamp);
    mReleasedTotalBytes -= oldest.mBytes;
    if (oldest.mProcessId == mParentProcessId) {
      aParentChunkManager.DestroyChunksAtOrBefore(oldest.mTimeStamp);
    } else {
      ProfilerParentTracker::ForChild(
          oldest.mProcessId,
          [timestamp = oldest.mTimeStamp](ProfilerParent* profilerParent) {
            Unused << profilerParent->SendDestroyReleasedChunksAtOrBefore(
                timestamp);
          });
    }
    mReleasedChunksByTime.RemoveElementAt(0);
  }
}

/* static */
ProfilerParentTracker* ProfilerParentTracker::GetInstance() {
  MOZ_RELEASE_ASSERT(NS_IsMainThread());

  // The main instance pointer, it will be initialized at most once, before
  // XPCOMShutdownThreads.
  static StaticAutoPtr<ProfilerParentTracker> instance;
  if (MOZ_UNLIKELY(!instance)) {
    if (PastShutdownPhase(ShutdownPhase::XPCOMShutdownThreads)) {
      return nullptr;
    }

    instance = new ProfilerParentTracker();

    // The tracker should get destroyed before threads are shutdown, because its
    // destruction closes extant channels, which could trigger promise
    // rejections that need to be dispatched to other threads.
    ClearOnShutdown(&instance, ShutdownPhase::XPCOMShutdownThreads);
  }

  return instance.get();
}

/* static */
void ProfilerParentTracker::StartTracking(ProfilerParent* aProfilerParent) {
  ProfilerParentTracker* tracker = GetInstance();
  if (!tracker) {
    return;
  }

  if (tracker->mMaybeController.isNothing() && tracker->mEntries != 0) {
    // There is no controller yet, but the profiler has started.
    // Since we're adding a ProfilerParent, it's a good time to start
    // controlling the global memory usage of the profiler.
    // (And this helps delay the Controller startup, because the parent profiler
    // can start *very* early in the process, when some resources like threads
    // are not ready yet.)
    tracker->mMaybeController.emplace(size_t(tracker->mEntries) *
                                      scBytesPerEntry);
  }

  tracker->mProfilerParents.AppendElement(aProfilerParent);
}

/* static */
void ProfilerParentTracker::StopTracking(ProfilerParent* aParent) {
  ProfilerParentTracker* tracker = GetInstance();
  if (!tracker) {
    return;
  }

  tracker->mProfilerParents.RemoveElement(aParent);
}

/* static */
void ProfilerParentTracker::ProfilerStarted(uint32_t aEntries) {
  ProfilerParentTracker* tracker = GetInstance();
  if (!tracker) {
    return;
  }

  tracker->mEntries = ClampToAllowedEntries(aEntries);

  if (tracker->mMaybeController.isNothing() &&
      !tracker->mProfilerParents.IsEmpty()) {
    // We are already tracking child processes, so it's a good time to start
    // controlling the global memory usage of the profiler.
    tracker->mMaybeController.emplace(size_t(tracker->mEntries) *
                                      scBytesPerEntry);
  }
}

/* static */
void ProfilerParentTracker::ProfilerWillStopIfStarted() {
  ProfilerParentTracker* tracker = GetInstance();
  if (!tracker) {
    return;
  }

  tracker->mEntries = 0;
  tracker->mMaybeController = Nothing{};
}

/* static */
size_t ProfilerParentTracker::ProfilerParentCount() {
  size_t count = 0;
  ProfilerParentTracker* tracker = GetInstance();
  if (tracker) {
    for (ProfilerParent* profilerParent : tracker->mProfilerParents) {
      if (!profilerParent->mDestroyed) {
        ++count;
      }
    }
  }
  return count;
}

template <typename FuncType>
/* static */
void ProfilerParentTracker::Enumerate(FuncType&& aIterFunc) {
  ProfilerParentTracker* tracker = GetInstance();
  if (!tracker) {
    return;
  }

  for (ProfilerParent* profilerParent : tracker->mProfilerParents) {
    if (!profilerParent->mDestroyed) {
      aIterFunc(profilerParent);
    }
  }
}

template <typename FuncType>
/* static */
void ProfilerParentTracker::ForChild(base::ProcessId aChildPid,
                                     FuncType&& aIterFunc) {
  ProfilerParentTracker* tracker = GetInstance();
  if (!tracker) {
    return;
  }

  for (ProfilerParent* profilerParent : tracker->mProfilerParents) {
    if (profilerParent->mChildPid == aChildPid) {
      if (!profilerParent->mDestroyed) {
        std::forward<FuncType>(aIterFunc)(profilerParent);
      }
      return;
    }
  }
}

/* static */
void ProfilerParentTracker::ForwardChildChunkManagerUpdate(
    base::ProcessId aProcessId,
    ProfileBufferControlledChunkManager::Update&& aUpdate) {
  ProfilerParentTracker* tracker = GetInstance();
  if (!tracker || tracker->mMaybeController.isNothing()) {
    return;
  }

  MOZ_ASSERT(!aUpdate.IsNotUpdate(),
             "No process should ever send a non-update");
  tracker->mMaybeController->HandleChildChunkManagerUpdate(aProcessId,
                                                           std::move(aUpdate));
}

ProfilerParentTracker::ProfilerParentTracker() {
  MOZ_RELEASE_ASSERT(NS_IsMainThread());
  MOZ_COUNT_CTOR(ProfilerParentTracker);
}

ProfilerParentTracker::~ProfilerParentTracker() {
  // This destructor should only be called on the main thread.
  MOZ_RELEASE_ASSERT(NS_IsMainThread() ||
                     // OR we're not on the main thread (including if we are
                     // past the end of `main()`), which is fine *if* there are
                     // no ProfilerParent's still registered, in which case
                     // nothing else will happen in this destructor anyway.
                     // See bug 1713971 for more information.
                     mProfilerParents.IsEmpty());
  MOZ_COUNT_DTOR(ProfilerParentTracker);

  // Close the channels of any profiler parents that haven't been destroyed.
  for (ProfilerParent* profilerParent : mProfilerParents.Clone()) {
    if (!profilerParent->mDestroyed) {
      // Keep the object alive until the call to Close() has completed.
      // Close() will trigger a call to DeallocPProfilerParent.
      RefPtr<ProfilerParent> actor = profilerParent;
      actor->Close();
    }
  }
}

ProfilerParent::ProfilerParent(base::ProcessId aChildPid)
    : mChildPid(aChildPid), mDestroyed(false) {
  MOZ_COUNT_CTOR(ProfilerParent);

  MOZ_RELEASE_ASSERT(NS_IsMainThread());
}

void ProfilerParent::Init() {
  MOZ_RELEASE_ASSERT(NS_IsMainThread());

  ProfilerParentTracker::StartTracking(this);

  // We propagated the profiler state from the parent process to the child
  // process through MOZ_PROFILER_STARTUP* environment variables.
  // However, the profiler state might have changed in this process since then,
  // and now that an active communication channel has been established with the
  // child process, it's a good time to sync up the two profilers again.

  int entries = 0;
  Maybe<double> duration = Nothing();
  double interval = 0;
  mozilla::Vector<const char*> filters;
  uint32_t features;
  uint64_t activeTabID;
  profiler_get_start_params(&entries, &duration, &interval, &features, &filters,
                            &activeTabID);

  if (entries != 0) {
    ProfilerInitParams ipcParams;
    ipcParams.enabled() = true;
    ipcParams.entries() = entries;
    ipcParams.duration() = duration;
    ipcParams.interval() = interval;
    ipcParams.features() = features;
    ipcParams.activeTabID() = activeTabID;

    // If the filters exclude our pid, make sure it's stopped, otherwise
    // continue with starting it.
    if (!profiler::detail::FiltersExcludePid(
            filters, ProfilerProcessId::FromNumber(mChildPid))) {
      ipcParams.filters().SetCapacity(filters.length());
      for (const char* filter : filters) {
        ipcParams.filters().AppendElement(filter);
      }

      Unused << SendEnsureStarted(ipcParams);
      RequestChunkManagerUpdate();
      return;
    }
  }

  Unused << SendStop();
}
#endif  // MOZ_GECKO_PROFILER

ProfilerParent::~ProfilerParent() {
  MOZ_COUNT_DTOR(ProfilerParent);

  MOZ_RELEASE_ASSERT(NS_IsMainThread());
#ifdef MOZ_GECKO_PROFILER
  ProfilerParentTracker::StopTracking(this);
#endif
}

#ifdef MOZ_GECKO_PROFILER
/* static */
nsTArray<ProfilerParent::SingleProcessProfilePromiseAndChildPid>
ProfilerParent::GatherProfiles() {
  nsTArray<SingleProcessProfilePromiseAndChildPid> results;
  if (!NS_IsMainThread()) {
    return results;
  }

  results.SetCapacity(ProfilerParentTracker::ProfilerParentCount());
  ProfilerParentTracker::Enumerate([&](ProfilerParent* profilerParent) {
    results.AppendElement(SingleProcessProfilePromiseAndChildPid{
        profilerParent->SendGatherProfile(), profilerParent->mChildPid});
  });
  return results;
}

/* static */
RefPtr<ProfilerParent::SingleProcessProgressPromise>
ProfilerParent::RequestGatherProfileProgress(base::ProcessId aChildPid) {
  RefPtr<SingleProcessProgressPromise> promise;
  ProfilerParentTracker::ForChild(
      aChildPid, [&promise](ProfilerParent* profilerParent) {
        promise = profilerParent->SendGetGatherProfileProgress();
      });
  return promise;
}

// Magic value for ProfileBufferChunkManagerUpdate::unreleasedBytes meaning
// that this is a final update from a child.
constexpr static uint64_t scUpdateUnreleasedBytesFINAL = uint64_t(-1);

/* static */
ProfileBufferChunkManagerUpdate ProfilerParent::MakeFinalUpdate() {
  return ProfileBufferChunkManagerUpdate{
      uint64_t(scUpdateUnreleasedBytesFINAL), 0, TimeStamp{},
      nsTArray<ProfileBufferChunkMetadata>{}};
}

/* static */
bool ProfilerParent::IsLockedOnCurrentThread() {
  return ProfileBufferGlobalController::IsLockedOnCurrentThread();
}

void ProfilerParent::RequestChunkManagerUpdate() {
  if (mDestroyed) {
    return;
  }

  RefPtr<AwaitNextChunkManagerUpdatePromise> updatePromise =
      SendAwaitNextChunkManagerUpdate();
  updatePromise->Then(
      GetMainThreadSerialEventTarget(), __func__,
      [self = RefPtr<ProfilerParent>(this)](
          const ProfileBufferChunkManagerUpdate& aUpdate) {
        if (aUpdate.unreleasedBytes() == scUpdateUnreleasedBytesFINAL) {
          // Special value meaning it's the final update from that child.
          ProfilerParentTracker::ForwardChildChunkManagerUpdate(
              self->mChildPid,
              ProfileBufferControlledChunkManager::Update(nullptr));
        } else {
          // Not the final update, translate it.
          std::vector<ProfileBufferControlledChunkManager::ChunkMetadata>
              chunks;
          if (!aUpdate.newlyReleasedChunks().IsEmpty()) {
            chunks.reserve(aUpdate.newlyReleasedChunks().Length());
            for (const ProfileBufferChunkMetadata& chunk :
                 aUpdate.newlyReleasedChunks()) {
              chunks.emplace_back(chunk.doneTimeStamp(), chunk.bufferBytes());
            }
          }
          // Let the tracker handle it.
          ProfilerParentTracker::ForwardChildChunkManagerUpdate(
              self->mChildPid,
              ProfileBufferControlledChunkManager::Update(
                  aUpdate.unreleasedBytes(), aUpdate.releasedBytes(),
                  aUpdate.oldestDoneTimeStamp(), std::move(chunks)));
          // This was not a final update, so start a new request.
          self->RequestChunkManagerUpdate();
        }
      },
      [self = RefPtr<ProfilerParent>(this)](
          mozilla::ipc::ResponseRejectReason aReason) {
        // Rejection could be for a number of reasons, assume the child will
        // not respond anymore, so we pretend we received a final update.
        ProfilerParentTracker::ForwardChildChunkManagerUpdate(
            self->mChildPid,
            ProfileBufferControlledChunkManager::Update(nullptr));
      });
}

// Ref-counted class that resolves a promise on destruction.
// Usage:
// RefPtr<GenericPromise> f() {
//   return PromiseResolverOnDestruction::RunTask(
//     [](RefPtr<PromiseResolverOnDestruction> aPromiseResolver){
//       // Give *copies* of aPromiseResolver to asynchronous sub-tasks, the
//       // last remaining RefPtr destruction will resolve the promise.
//     });
// }
class PromiseResolverOnDestruction {
 public:
  NS_INLINE_DECL_REFCOUNTING(PromiseResolverOnDestruction)

  template <typename TaskFunction>
  static RefPtr<GenericPromise> RunTask(TaskFunction&& aTaskFunction) {
    RefPtr<PromiseResolverOnDestruction> promiseResolver =
        new PromiseResolverOnDestruction();
    RefPtr<GenericPromise> promise =
        promiseResolver->mPromiseHolder.Ensure(__func__);
    std::forward<TaskFunction>(aTaskFunction)(std::move(promiseResolver));
    return promise;
  }

 private:
  PromiseResolverOnDestruction() = default;

  ~PromiseResolverOnDestruction() {
    mPromiseHolder.ResolveIfExists(/* unused */ true, __func__);
  }

  MozPromiseHolder<GenericPromise> mPromiseHolder;
};

// Given a ProfilerParentSendFunction: (ProfilerParent*) -> some MozPromise,
// run the function on all live ProfilerParents and return a GenericPromise, and
// when their promise gets resolve, resolve our Generic promise.
template <typename ProfilerParentSendFunction>
static RefPtr<GenericPromise> SendAndConvertPromise(
    ProfilerParentSendFunction&& aProfilerParentSendFunction) {
  if (!NS_IsMainThread()) {
    return GenericPromise::CreateAndResolve(/* unused */ true, __func__);
  }

  return PromiseResolverOnDestruction::RunTask(
      [&](RefPtr<PromiseResolverOnDestruction> aPromiseResolver) {
        ProfilerParentTracker::Enumerate([&](ProfilerParent* profilerParent) {
          std::forward<ProfilerParentSendFunction>(aProfilerParentSendFunction)(
              profilerParent)
              ->Then(GetMainThreadSerialEventTarget(), __func__,
                     [aPromiseResolver](
                         typename std::remove_reference_t<
                             decltype(*std::forward<ProfilerParentSendFunction>(
                                 aProfilerParentSendFunction)(
                                 profilerParent))>::ResolveOrRejectValue&&) {
                       // Whatever the resolution/rejection is, do nothing.
                       // The lambda aPromiseResolver ref-count will decrease.
                     });
        });
      });
}

/* static */
RefPtr<GenericPromise> ProfilerParent::ProfilerStarted(
    nsIProfilerStartParams* aParams) {
  if (!NS_IsMainThread()) {
    return GenericPromise::CreateAndResolve(/* unused */ true, __func__);
  }

  ProfilerInitParams ipcParams;
  double duration;
  ipcParams.enabled() = true;
  aParams->GetEntries(&ipcParams.entries());
  aParams->GetDuration(&duration);
  if (duration > 0.0) {
    ipcParams.duration() = Some(duration);
  } else {
    ipcParams.duration() = Nothing();
  }
  aParams->GetInterval(&ipcParams.interval());
  aParams->GetFeatures(&ipcParams.features());
  ipcParams.filters() = aParams->GetFilters().Clone();
  // We need filters as a Span<const char*> to test pids in the lambda below.
  auto filtersCStrings = nsTArray<const char*>{aParams->GetFilters().Length()};
  for (const auto& filter : aParams->GetFilters()) {
    filtersCStrings.AppendElement(filter.Data());
  }
  aParams->GetActiveTabID(&ipcParams.activeTabID());

  ProfilerParentTracker::ProfilerStarted(ipcParams.entries());

  return SendAndConvertPromise([&](ProfilerParent* profilerParent) {
    if (profiler::detail::FiltersExcludePid(
            filtersCStrings,
            ProfilerProcessId::FromNumber(profilerParent->mChildPid))) {
      // This pid is excluded, don't start the profiler at all.
      return PProfilerParent::StartPromise::CreateAndResolve(/* unused */ true,
                                                             __func__);
    }
    auto promise = profilerParent->SendStart(ipcParams);
    profilerParent->RequestChunkManagerUpdate();
    return promise;
  });
}

/* static */
void ProfilerParent::ProfilerWillStopIfStarted() {
  if (!NS_IsMainThread()) {
    return;
  }

  ProfilerParentTracker::ProfilerWillStopIfStarted();
}

/* static */
RefPtr<GenericPromise> ProfilerParent::ProfilerStopped() {
  return SendAndConvertPromise([](ProfilerParent* profilerParent) {
    return profilerParent->SendStop();
  });
}

/* static */
RefPtr<GenericPromise> ProfilerParent::ProfilerPaused() {
  return SendAndConvertPromise([](ProfilerParent* profilerParent) {
    return profilerParent->SendPause();
  });
}

/* static */
RefPtr<GenericPromise> ProfilerParent::ProfilerResumed() {
  return SendAndConvertPromise([](ProfilerParent* profilerParent) {
    return profilerParent->SendResume();
  });
}

/* static */
RefPtr<GenericPromise> ProfilerParent::ProfilerPausedSampling() {
  return SendAndConvertPromise([](ProfilerParent* profilerParent) {
    return profilerParent->SendPauseSampling();
  });
}

/* static */
RefPtr<GenericPromise> ProfilerParent::ProfilerResumedSampling() {
  return SendAndConvertPromise([](ProfilerParent* profilerParent) {
    return profilerParent->SendResumeSampling();
  });
}

/* static */
void ProfilerParent::ClearAllPages() {
  if (!NS_IsMainThread()) {
    return;
  }

  ProfilerParentTracker::Enumerate([](ProfilerParent* profilerParent) {
    Unused << profilerParent->SendClearAllPages();
  });
}

/* static */
RefPtr<GenericPromise> ProfilerParent::WaitOnePeriodicSampling() {
  return SendAndConvertPromise([](ProfilerParent* profilerParent) {
    return profilerParent->SendWaitOnePeriodicSampling();
  });
}

void ProfilerParent::ActorDestroy(ActorDestroyReason aActorDestroyReason) {
  MOZ_RELEASE_ASSERT(NS_IsMainThread());
  mDestroyed = true;
}

#endif

}  // namespace mozilla
