/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This file exports XPCOM components for C++ and chrome JavaScript callers to
 * interact with the Push service.
 */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";
import { ChromePushSubscription } from "./ChromePushSubscription.sys.mjs";

var isParent =
  Services.appinfo.processType === Ci.nsIXULRuntime.PROCESS_TYPE_DEFAULT;

const lazy = {};

// The default Push service implementation.
ChromeUtils.defineLazyGetter(lazy, "PushService", function () {
  if (Services.prefs.getBoolPref("dom.push.enabled")) {
    const { PushService } = ChromeUtils.importESModule(
      "resource://gre/modules/PushService.sys.mjs"
    );
    PushService.init();
    return PushService;
  }

  throw Components.Exception("", Cr.NS_ERROR_NOT_AVAILABLE);
});

// Observer notification topics for push messages and subscription status
// changes. These are duplicated and used in `nsIPushNotifier`. They're exposed
// on `nsIPushService` so that JS callers only need to import this service.
const OBSERVER_TOPIC_PUSH = "push-message";
const OBSERVER_TOPIC_SUBSCRIPTION_CHANGE = "push-subscription-change";
const OBSERVER_TOPIC_SUBSCRIPTION_MODIFIED = "push-subscription-modified";

/**
 * `PushServiceBase`, `PushServiceParent`, and `PushServiceContent` collectively
 * implement the `nsIPushService` interface. This interface provides calls
 * similar to the Push DOM API, but does not require service workers.
 *
 * Push service methods may be called from the parent or content process. The
 * parent process implementation loads `PushService.sys.mjs` at app startup, and
 * calls its methods directly. The content implementation forwards calls to
 * the parent Push service via IPC.
 *
 * The implementations share a class and contract ID.
 */
function PushServiceBase() {
  this.wrappedJSObject = this;
  this._addListeners();
}

PushServiceBase.prototype = {
  classID: Components.ID("{daaa8d73-677e-4233-8acd-2c404bd01658}"),
  contractID: "@mozilla.org/push/Service;1",
  QueryInterface: ChromeUtils.generateQI([
    "nsIObserver",
    "nsISupportsWeakReference",
    "nsIPushService",
    "nsIPushQuotaManager",
    "nsIPushErrorReporter",
  ]),

  pushTopic: OBSERVER_TOPIC_PUSH,
  subscriptionChangeTopic: OBSERVER_TOPIC_SUBSCRIPTION_CHANGE,
  subscriptionModifiedTopic: OBSERVER_TOPIC_SUBSCRIPTION_MODIFIED,

  ensureReady() {},

  _addListeners() {
    for (let message of this._messages) {
      this._mm.addMessageListener(message, this);
    }
  },

  _isValidMessage(message) {
    return this._messages.includes(message.name);
  },

  observe(subject, topic) {
    if (topic === "android-push-service") {
      // Load PushService immediately.
      this.ensureReady();
    }
  },

  _deliverSubscription(request, props) {
    if (!props) {
      request.onPushSubscription(Cr.NS_OK, null);
      return;
    }
    request.onPushSubscription(Cr.NS_OK, new ChromePushSubscription(props));
  },

  _deliverSubscriptionError(request, error) {
    let result =
      typeof error.result == "number" ? error.result : Cr.NS_ERROR_FAILURE;
    request.onPushSubscription(result, null);
  },
};

/**
 * The parent process implementation of `nsIPushService`. This version loads
 * `PushService.sys.mjs` at startup and calls its methods directly. It also
 * receives and responds to requests from the content process.
 */
let parentInstance;
function PushServiceParent() {
  if (parentInstance) {
    return parentInstance;
  }
  parentInstance = this;

  PushServiceBase.call(this);
}

PushServiceParent.prototype = Object.create(PushServiceBase.prototype);

XPCOMUtils.defineLazyServiceGetter(
  PushServiceParent.prototype,
  "_mm",
  "@mozilla.org/parentprocessmessagemanager;1",
  "nsISupports"
);

Object.assign(PushServiceParent.prototype, {
  _messages: [
    "Push:Register",
    "Push:Registration",
    "Push:Unregister",
    "Push:Clear",
    "Push:ReportError",
  ],

  // nsIPushService methods

  subscribe(scope, principal, callback) {
    this.subscribeWithKey(scope, principal, [], callback);
  },

  subscribeWithKey(scope, principal, key, callback) {
    this._handleRequest("Push:Register", principal, {
      scope,
      appServerKey: key,
    })
      .then(
        result => {
          this._deliverSubscription(callback, result);
        },
        error => {
          this._deliverSubscriptionError(callback, error);
        }
      )
      .catch(console.error);
  },

  unsubscribe(scope, principal, callback) {
    this._handleRequest("Push:Unregister", principal, {
      scope,
    })
      .then(
        result => {
          callback.onUnsubscribe(Cr.NS_OK, result);
        },
        () => {
          callback.onUnsubscribe(Cr.NS_ERROR_FAILURE, false);
        }
      )
      .catch(console.error);
  },

  getSubscription(scope, principal, callback) {
    return this._handleRequest("Push:Registration", principal, {
      scope,
    })
      .then(
        result => {
          this._deliverSubscription(callback, result);
        },
        error => {
          this._deliverSubscriptionError(callback, error);
        }
      )
      .catch(console.error);
  },

  clearForDomain(domain, originAttributesPattern, callback) {
    return this._handleRequest("Push:Clear", null, {
      domain,
      originAttributesPattern,
    })
      .then(
        () => {
          callback.onClear(Cr.NS_OK);
        },
        () => {
          callback.onClear(Cr.NS_ERROR_FAILURE);
        }
      )
      .catch(console.error);
  },

  clearForPrincipal(principal, callback) {
    return this._handleRequest("Push:Clear", null, {
      principal,
    })
      .then(
        () => {
          callback.onClear(Cr.NS_OK);
        },
        () => {
          callback.onClear(Cr.NS_ERROR_FAILURE);
        }
      )
      .catch(console.error);
  },

  // nsIPushQuotaManager methods

  notificationForOriginShown(origin) {
    this.service.notificationForOriginShown(origin);
  },

  notificationForOriginClosed(origin) {
    this.service.notificationForOriginClosed(origin);
  },

  // nsIPushErrorReporter methods

  reportDeliveryError(messageId, reason) {
    this.service.reportDeliveryError(messageId, reason);
  },

  receiveMessage(message) {
    if (!this._isValidMessage(message)) {
      return;
    }
    let { name, target, data } = message;
    if (name === "Push:ReportError") {
      this.reportDeliveryError(data.messageId, data.reason);
      return;
    }
    this._handleRequest(name, data.principal, data)
      .then(
        result => {
          target.sendAsyncMessage(this._getResponseName(name, "OK"), {
            requestID: data.requestID,
            result,
          });
        },
        error => {
          target.sendAsyncMessage(this._getResponseName(name, "KO"), {
            requestID: data.requestID,
            result: error.result,
          });
        }
      )
      .catch(console.error);
  },

  ensureReady() {
    this.service.init();
  },

  _toPageRecord(principal, data) {
    if (!data.scope) {
      throw new Error("Invalid page record: missing scope");
    }
    if (!principal) {
      throw new Error("Invalid page record: missing principal");
    }
    if (principal.isNullPrincipal || principal.isExpandedPrincipal) {
      throw new Error("Invalid page record: unsupported principal");
    }

    // System subscriptions can only be created by chrome callers, and are
    // exempt from the background message quota and permission checks. They
    // also do not fire service worker events.
    data.systemRecord = principal.isSystemPrincipal;

    data.originAttributes = ChromeUtils.originAttributesToSuffix(
      principal.originAttributes
    );

    return data;
  },

  async _handleRequest(name, principal, data) {
    if (name == "Push:Clear") {
      return this.service.clear(data);
    }

    let pageRecord;
    try {
      pageRecord = this._toPageRecord(principal, data);
    } catch (e) {
      return Promise.reject(e);
    }

    if (name === "Push:Register") {
      return this.service.register(pageRecord);
    }
    if (name === "Push:Registration") {
      return this.service.registration(pageRecord);
    }
    if (name === "Push:Unregister") {
      return this.service.unregister(pageRecord);
    }

    return Promise.reject(new Error("Invalid request: unknown name"));
  },

  _getResponseName(requestName, suffix) {
    let name = requestName.slice("Push:".length);
    return "PushService:" + name + ":" + suffix;
  },

  // Methods used for mocking in tests.

  replaceServiceBackend(options) {
    return this.service.changeTestServer(options.serverURI, options);
  },

  restoreServiceBackend() {
    var defaultServerURL = Services.prefs.getCharPref("dom.push.serverURL");
    return this.service.changeTestServer(defaultServerURL);
  },
});

// Used to replace the implementation with a mock.
Object.defineProperty(PushServiceParent.prototype, "service", {
  get() {
    return this._service || lazy.PushService;
  },
  set(impl) {
    this._service = impl;
  },
});

let contentInstance;
/**
 * The content process implementation of `nsIPushService`. This version
 * uses the child message manager to forward calls to the parent process.
 * The parent Push service instance handles the request, and responds with a
 * message containing the result.
 */
function PushServiceContent() {
  if (contentInstance) {
    return contentInstance;
  }
  contentInstance = this;

  PushServiceBase.apply(this, arguments);
  this._requests = new Map();
  this._requestId = 0;
}

PushServiceContent.prototype = Object.create(PushServiceBase.prototype);

XPCOMUtils.defineLazyServiceGetter(
  PushServiceContent.prototype,
  "_mm",
  "@mozilla.org/childprocessmessagemanager;1",
  "nsISupports"
);

Object.assign(PushServiceContent.prototype, {
  _messages: [
    "PushService:Register:OK",
    "PushService:Register:KO",
    "PushService:Registration:OK",
    "PushService:Registration:KO",
    "PushService:Unregister:OK",
    "PushService:Unregister:KO",
    "PushService:Clear:OK",
    "PushService:Clear:KO",
  ],

  // nsIPushService methods

  subscribe(scope, principal, callback) {
    this.subscribeWithKey(scope, principal, [], callback);
  },

  subscribeWithKey(scope, principal, key, callback) {
    let requestID = this._addRequest(callback);
    this._mm.sendAsyncMessage("Push:Register", {
      scope,
      appServerKey: key,
      requestID,
      principal,
    });
  },

  unsubscribe(scope, principal, callback) {
    let requestID = this._addRequest(callback);
    this._mm.sendAsyncMessage("Push:Unregister", {
      scope,
      requestID,
      principal,
    });
  },

  getSubscription(scope, principal, callback) {
    let requestID = this._addRequest(callback);
    this._mm.sendAsyncMessage("Push:Registration", {
      scope,
      requestID,
      principal,
    });
  },

  clearForDomain(domain, callback) {
    let requestID = this._addRequest(callback);
    this._mm.sendAsyncMessage("Push:Clear", {
      domain,
      requestID,
    });
  },

  // nsIPushErrorReporter methods

  reportDeliveryError(messageId, reason) {
    this._mm.sendAsyncMessage("Push:ReportError", {
      messageId,
      reason,
    });
  },

  _addRequest(data) {
    let id = ++this._requestId;
    this._requests.set(id, data);
    return id;
  },

  _takeRequest(requestId) {
    let d = this._requests.get(requestId);
    this._requests.delete(requestId);
    return d;
  },

  receiveMessage(message) {
    if (!this._isValidMessage(message)) {
      return;
    }
    let { name, data } = message;
    let request = this._takeRequest(data.requestID);

    if (!request) {
      return;
    }

    switch (name) {
      case "PushService:Register:OK":
      case "PushService:Registration:OK":
        this._deliverSubscription(request, data.result);
        break;

      case "PushService:Register:KO":
      case "PushService:Registration:KO":
        this._deliverSubscriptionError(request, data);
        break;

      case "PushService:Unregister:OK":
        if (typeof data.result === "boolean") {
          request.onUnsubscribe(Cr.NS_OK, data.result);
        } else {
          request.onUnsubscribe(Cr.NS_ERROR_FAILURE, false);
        }
        break;

      case "PushService:Unregister:KO":
        request.onUnsubscribe(Cr.NS_ERROR_FAILURE, false);
        break;

      case "PushService:Clear:OK":
        request.onClear(Cr.NS_OK);
        break;

      case "PushService:Clear:KO":
        request.onClear(Cr.NS_ERROR_FAILURE);
        break;

      default:
        break;
    }
  },
});

// Export the correct implementation depending on whether we're running in
// the parent or content process.
export let Service = isParent ? PushServiceParent : PushServiceContent;
