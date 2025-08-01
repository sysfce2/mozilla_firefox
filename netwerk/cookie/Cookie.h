/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_net_Cookie_h
#define mozilla_net_Cookie_h

#include "nsICookie.h"
#include "nsIMemoryReporter.h"
#include "nsString.h"

#include "mozilla/MemoryReporting.h"
#include "mozilla/BasePrincipal.h"
#include "mozilla/net/NeckoChannelParams.h"
#include "nsIMemoryReporter.h"

using mozilla::OriginAttributes;

namespace mozilla {
namespace net {

/**
 * The Cookie class is the main cookie storage medium for use within cookie
 * code.
 */

/******************************************************************************
 * Cookie:
 * implementation
 ******************************************************************************/

class Cookie final : public nsICookie {
  MOZ_DEFINE_MALLOC_SIZE_OF(MallocSizeOf)

 public:
  // nsISupports
  NS_DECL_ISUPPORTS
  NS_DECL_NSICOOKIE

  static Cookie* Cast(nsICookie* aCookie) {
    return static_cast<Cookie*>(aCookie);
  }

  static const Cookie* Cast(const nsICookie* aCookie) {
    return static_cast<const Cookie*>(aCookie);
  }

 private:
  // for internal use only. see Cookie::Create().
  Cookie(const CookieStruct& aCookieData,
         const OriginAttributes& aOriginAttributes)
      : mData(aCookieData), mOriginAttributes(aOriginAttributes) {}

  static already_AddRefed<Cookie> FromCookieStruct(
      const CookieStruct& aCookieData,
      const OriginAttributes& aOriginAttributes);

 public:
  // Generate a unique and monotonically increasing creation time. See comment
  // in Cookie.cpp.
  static int64_t GenerateUniqueCreationTime(int64_t aCreationTime);

  // public helper to create an Cookie object.
  static already_AddRefed<Cookie> Create(
      const CookieStruct& aCookieData,
      const OriginAttributes& aOriginAttributes);

  // Same as Cookie::Create but fixes the lastAccessed and creationDates
  // if they are set in the future.
  // Should only get called from CookiePersistentStorage::InitDBConn
  static already_AddRefed<Cookie> CreateValidated(
      const CookieStruct& aCookieData,
      const OriginAttributes& aOriginAttributes);

  size_t SizeOfIncludingThis(mozilla::MallocSizeOf aMallocSizeOf) const;

  // fast (inline, non-xpcom) getters
  inline const nsCString& Name() const { return mData.name(); }
  inline const nsCString& Value() const { return mData.value(); }
  inline const nsCString& Host() const { return mData.host(); }
  inline nsDependentCSubstring RawHost() const {
    return nsDependentCSubstring(mData.host(), IsDomain() ? 1 : 0);
  }
  inline const nsCString& Path() const { return mData.path(); }
  inline int64_t Expiry() const { return mData.expiry(); }  // in milliseconds
  inline int64_t LastAccessed() const {
    return mData.lastAccessed();
  }  // in microseconds
  inline int64_t CreationTime() const {
    return mData.creationTime();
  }  // in microseconds
  inline bool IsSession() const { return mData.isSession(); }
  inline bool IsDomain() const { return *mData.host().get() == '.'; }
  inline bool IsSecure() const { return mData.isSecure(); }
  inline bool IsHttpOnly() const { return mData.isHttpOnly(); }
  inline bool IsPartitioned() const {
    return !mOriginAttributes.mPartitionKey.IsEmpty();
  }
  inline bool RawIsPartitioned() const { return mData.isPartitioned(); }
  inline const OriginAttributes& OriginAttributesRef() const {
    return mOriginAttributes;
  }
  inline int32_t SameSite() const { return mData.sameSite(); }
  inline uint8_t SchemeMap() const { return mData.schemeMap(); }

  // setters
  inline void SetExpiry(int64_t aExpiry) { mData.expiry() = aExpiry; }
  inline void SetLastAccessed(int64_t aTime) { mData.lastAccessed() = aTime; }
  inline void SetIsSession(bool aIsSession) { mData.isSession() = aIsSession; }
  inline bool SetIsHttpOnly(bool aIsHttpOnly) {
    return mData.isHttpOnly() = aIsHttpOnly;
  }
  // Set the creation time manually, overriding the monotonicity checks in
  // Create(). Use with caution!
  inline void SetCreationTime(int64_t aTime) { mData.creationTime() = aTime; }
  inline void SetSchemeMap(uint8_t aSchemeMap) {
    mData.schemeMap() = aSchemeMap;
  }
  inline void SetSameSite(int32_t aSameSite) { mData.sameSite() = aSameSite; }
  inline void SetHost(const nsACString& aHost) { mData.host() = aHost; }

  uint32_t NameAndValueBytes() {
    return mData.name().Length() + mData.value().Length();
  }

  bool IsStale() const;

  const CookieStruct& ToIPC() const { return mData; }

  already_AddRefed<Cookie> Clone() const;

 protected:
  virtual ~Cookie() = default;

 private:
  // member variables
  //
  // Please update SizeOfIncludingThis if this strategy changes.
  CookieStruct mData;
  OriginAttributes mOriginAttributes;
};

// Comparator class for sorting cookies before sending to a server.
class CompareCookiesForSending {
 public:
  bool Equals(const nsICookie* aCookie1, const nsICookie* aCookie2) const {
    return Cookie::Cast(aCookie1)->CreationTime() ==
               Cookie::Cast(aCookie2)->CreationTime() &&
           Cookie::Cast(aCookie2)->Path().Length() ==
               Cookie::Cast(aCookie1)->Path().Length();
  }

  bool LessThan(const nsICookie* aCookie1, const nsICookie* aCookie2) const {
    // compare by cookie path length in accordance with RFC2109
    int32_t result = Cookie::Cast(aCookie2)->Path().Length() -
                     Cookie::Cast(aCookie1)->Path().Length();
    if (result != 0) return result < 0;

    // when path lengths match, older cookies should be listed first.  this is
    // required for backwards compatibility since some websites erroneously
    // depend on receiving cookies in the order in which they were sent to the
    // browser!  see bug 236772.
    return Cookie::Cast(aCookie1)->CreationTime() <
           Cookie::Cast(aCookie2)->CreationTime();
  }
};

}  // namespace net
}  // namespace mozilla

#endif  // mozilla_net_Cookie_h
