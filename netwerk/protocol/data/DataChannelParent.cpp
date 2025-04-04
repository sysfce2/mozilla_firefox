/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=4 sw=2 sts=2 et tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsDataChannel.h"
#include "DataChannelParent.h"
#include "mozilla/Assertions.h"
#include "mozilla/dom/ContentParent.h"
#include "mozilla/net/NeckoParent.h"
#include "nsNetUtil.h"
#include "nsIChannel.h"

#ifdef FUZZING_SNAPSHOT
#  define MOZ_ALWAYS_SUCCEEDS_FUZZING(...) (void)__VA_ARGS__
#else
#  define MOZ_ALWAYS_SUCCEEDS_FUZZING(...) MOZ_ALWAYS_SUCCEEDS(__VA_ARGS__)
#endif

namespace mozilla {
namespace net {

NS_IMPL_ISUPPORTS(DataChannelParent, nsIParentChannel, nsIStreamListener)

NS_IMETHODIMP
DataChannelParent::SetParentListener(ParentChannelListener* aListener) {
  // Nothing to do.
  return NS_OK;
}

NS_IMETHODIMP
DataChannelParent::NotifyClassificationFlags(uint32_t aClassificationFlags,
                                             bool aIsThirdParty) {
  // Nothing to do.
  return NS_OK;
}

NS_IMETHODIMP
DataChannelParent::SetClassifierMatchedInfo(const nsACString& aList,
                                            const nsACString& aProvider,
                                            const nsACString& aFullHash) {
  // nothing to do
  return NS_OK;
}

NS_IMETHODIMP
DataChannelParent::SetClassifierMatchedTrackingInfo(
    const nsACString& aLists, const nsACString& aFullHashes) {
  // nothing to do
  return NS_OK;
}

NS_IMETHODIMP
DataChannelParent::Delete() {
  // Nothing to do.
  return NS_OK;
}

NS_IMETHODIMP
DataChannelParent::GetRemoteType(nsACString& aRemoteType) {
  if (!CanSend()) {
    return NS_ERROR_UNEXPECTED;
  }

  dom::PContentParent* pcp = Manager()->Manager();
  aRemoteType = static_cast<dom::ContentParent*>(pcp)->GetRemoteType();
  return NS_OK;
}

void DataChannelParent::ActorDestroy(ActorDestroyReason why) {}

NS_IMETHODIMP
DataChannelParent::OnStartRequest(nsIRequest* aRequest) {
  // We don't have a way to prevent nsBaseChannel from calling AsyncOpen on
  // the created nsDataChannel. We don't have anywhere to send the data in the
  // parent, so abort the binding.
  return NS_BINDING_ABORTED;
}

NS_IMETHODIMP
DataChannelParent::OnStopRequest(nsIRequest* aRequest, nsresult aStatusCode) {
  // See above.
  MOZ_ASSERT(NS_FAILED(aStatusCode));
  return NS_OK;
}

NS_IMETHODIMP
DataChannelParent::OnDataAvailable(nsIRequest* aRequest,
                                   nsIInputStream* aInputStream,
                                   uint64_t aOffset, uint32_t aCount) {
  // See above.
  MOZ_CRASH("Should never be called");
}

mozilla::ipc::IPCResult DataChannelParent::RecvNotifyListeners(
    const DataChannelInfo& aDataChannelInfo) {
  nsCOMPtr<nsIObserverService> obsService = services::GetObserverService();
  if (!obsService) {
    return IPC_OK();
  }

  nsAutoCString remoteType;
  nsresult rv = GetRemoteType(remoteType);
  if (NS_FAILED(rv)) {
    return IPC_FAIL(this, "Failed to get remote type");
  }

  nsCOMPtr<nsILoadInfo> loadInfo;
  rv = mozilla::ipc::LoadInfoArgsToLoadInfo(
      aDataChannelInfo.loadInfo(), remoteType, getter_AddRefs(loadInfo));
  if (NS_FAILED(rv)) {
    return IPC_FAIL(this, "Failed to deserialize LoadInfo");
  }

  // Re-create a data channel in the parent process to notify
  // data-channel-opened observers.
  RefPtr<nsDataChannel> channel;
  channel = new nsDataChannel(aDataChannelInfo.uri());
  channel->SetLoadFlags(aDataChannelInfo.loadFlags());
  channel->SetLoadInfo(loadInfo);
  channel->SetContentType(aDataChannelInfo.contentType());

  rv = channel->SetChannelId(aDataChannelInfo.channelId());
  if (NS_FAILED(rv)) {
    return IPC_FAIL(this, "Failed to set channel id");
  }

  obsService->NotifyObservers(static_cast<nsIIdentChannel*>(channel),
                              "data-channel-opened", nullptr);
  return IPC_OK();
}

mozilla::ipc::IPCResult DataChannelParent::RecvSetChannelIdForRedirect(
    const uint64_t& aChannelId) {
  nsCOMPtr<nsIChannel> channel;

  MOZ_ALWAYS_SUCCEEDS_FUZZING(
      NS_LinkRedirectChannels(aChannelId, this, getter_AddRefs(channel)));

  return IPC_OK();
}

}  // namespace net
}  // namespace mozilla
