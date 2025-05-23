/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const {
  Component,
} = require("resource://devtools/client/shared/vendor/react.mjs");
const dom = require("resource://devtools/client/shared/vendor/react-dom-factories.js");
const PropTypes = require("resource://devtools/client/shared/vendor/react-prop-types.mjs");
const {
  getFormattedSize,
} = require("resource://devtools/client/netmonitor/src/utils/format-utils.js");
const {
  L10N,
  getBlockedReasonString,
} = require("resource://devtools/client/netmonitor/src/utils/l10n.js");
const {
  propertiesEqual,
} = require("resource://devtools/client/netmonitor/src/utils/request-utils.js");

const SIZE_CACHED = L10N.getStr("networkMenu.sizeCached");
const SIZE_SERVICE_WORKER = L10N.getStr("networkMenu.sizeServiceWorker");
const SIZE_UNAVAILABLE = L10N.getStr("networkMenu.sizeUnavailable");
const SIZE_UNAVAILABLE_TITLE = L10N.getStr("networkMenu.sizeUnavailable.title");
const UPDATED_TRANSFERRED_PROPS = [
  "transferredSize",
  "fromCache",
  "isRacing",
  "fromServiceWorker",
];

class RequestListColumnTransferredSize extends Component {
  static get propTypes() {
    return {
      item: PropTypes.object.isRequired,
    };
  }

  shouldComponentUpdate(nextProps) {
    return !propertiesEqual(
      UPDATED_TRANSFERRED_PROPS,
      this.props.item,
      nextProps.item
    );
  }

  render() {
    const {
      blockedReason,
      blockingExtension,
      fromCache,
      fromServiceWorker,
      status,
      transferredSize,
      isRacing,
    } = this.props.item;
    let text;

    if (blockedReason) {
      text = getBlockedReasonString(blockedReason, blockingExtension);
    } else if (fromCache || status === "304") {
      text = SIZE_CACHED;
    } else if (fromServiceWorker) {
      text = SIZE_SERVICE_WORKER;
    } else if (typeof transferredSize == "number") {
      text = getFormattedSize(transferredSize);
      if (isRacing && typeof isRacing == "boolean") {
        text = L10N.getFormatStr("networkMenu.raced", text);
      }
    } else if (transferredSize === null) {
      text = SIZE_UNAVAILABLE;
    }

    const title = text == SIZE_UNAVAILABLE ? SIZE_UNAVAILABLE_TITLE : text;

    return dom.td(
      {
        className: "requests-list-column requests-list-transferred",
        title,
      },
      text
    );
  }
}

module.exports = RequestListColumnTransferredSize;
