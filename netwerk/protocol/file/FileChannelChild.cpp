/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=2 sw=2 sts=2 et tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "FileChannelChild.h"

#include "mozilla/Unused.h"
#include "mozilla/dom/ContentChild.h"
#include "mozilla/net/NeckoChild.h"

namespace mozilla {
namespace net {

NS_IMPL_ISUPPORTS_INHERITED(FileChannelChild, nsFileChannel, nsIChildChannel)

FileChannelChild::FileChannelChild(nsIURI* uri) : nsFileChannel(uri) {
  mozilla::dom::ContentChild* cc =
      static_cast<mozilla::dom::ContentChild*>(gNeckoChild->Manager());
  if (!cc->IsShuttingDown()) {
    gNeckoChild->SendPFileChannelConstructor(this);
  }
}

NS_IMETHODIMP
FileChannelChild::ConnectParent(uint32_t id) {
  SendSetChannelIdForRedirect(id);
  return NS_OK;
}

NS_IMETHODIMP
FileChannelChild::CompleteRedirectSetup(nsIStreamListener* listener) {
  nsresult rv;

  rv = AsyncOpen(listener);

  if (NS_WARN_IF(NS_FAILED(rv))) {
    return rv;
  }

  if (CanSend()) {
    Unused << Send__delete__(this);
  }

  return NS_OK;
}

nsresult FileChannelChild::NotifyListeners() {
  uint32_t loadFlags = 0;
  GetLoadFlags(&loadFlags);

  LoadInfoArgs loadInfoArgs;
  MOZ_ALWAYS_SUCCEEDS(
      mozilla::ipc::LoadInfoToLoadInfoArgs(mLoadInfo, &loadInfoArgs));

  nsCOMPtr<nsIURI> originalURI;
  nsresult rv = GetOriginalURI(getter_AddRefs(originalURI));
  NS_ENSURE_SUCCESS(rv, rv);
  FileChannelInfo fileChannelInfo(mURI, originalURI, loadFlags, loadInfoArgs,
                                  mContentType, mChannelId);
  SendNotifyListeners(fileChannelInfo);
  return NS_OK;
}

}  // namespace net
}  // namespace mozilla
