#!/bin/bash

set +vex

if [ $# -lt 1 ]; then
  echo update.sh "<revision to update to>"
  exit 1
fi

if [ ! -f "$GECKO_PATH/mach" ]; then
	echo "GECKO_PATH ($GECKO_PATH) does not appear to be a mozilla-central checkout"
	exit 1
fi

if [ -v TASK_ID ]; then
	# if we are running in taskcluster, then use the pre-obtained pdfjs checkout
	export ROOT=/builds/worker/pdf.js
elif [ -v PDFJS_CHECKOUT ]; then
	export ROOT=$PDFJS_CHECKOUT
else
	PDFJS_TMPDIR="/tmp/pdfjs-$(date +%s)"
	git clone https://github.com/mozilla/pdf.js "$PDFJS_TMPDIR"
	export ROOT=$PDFJS_TMPDIR
fi

pushd "$ROOT" || exit
git fetch origin
git checkout "$1"

npm install --legacy-peer-deps --ignore-scripts

gulp mozcentral

popd || exit


mkdir -p "$ROOT/build/mozcentral/browser/extensions/pdfjs/"

cp "$ROOT/build/mozcentral/browser/extensions/pdfjs/content/LICENSE" "$GECKO_PATH/toolkit/components/pdfjs/"
cp "$ROOT/build/mozcentral/browser/extensions/pdfjs/PdfJsDefaultPrefs.js" "$GECKO_PATH/toolkit/components/pdfjs/PdfJsDefaultPrefs.js"
rsync -a -v --delete "$ROOT/build/mozcentral/browser/extensions/pdfjs/content/build/" "$GECKO_PATH/toolkit/components/pdfjs/content/build/"
rsync -a -v --delete "$ROOT/build/mozcentral/browser/extensions/pdfjs/content/web/" "$GECKO_PATH/toolkit/components/pdfjs/content/web/"

ls -R "$ROOT/build/mozcentral/browser/"
cp "$ROOT"/build/mozcentral/browser/locales/en-US/pdfviewer/*.ftl "$GECKO_PATH/toolkit/locales/en-US/toolkit/pdfviewer/" || true

# For now we don't update the revision because we need to reduce the number of files to test
# (cf https://bugzilla.mozilla.org/show_bug.cgi?id=1940144 for re-enabling).
# Update the revision in the toolchains.yml file for the Talos tests.
# sed -i -z "s/\(mozilla-pdf\.js.*revision: \)[0-9a-f]*/\1$1/g" "$GECKO_PATH/taskcluster/kinds/fetch/toolchains.yml"

if [ -v PDFJS_TMPDIR ]; then
	rm -rf "$PDFJS_TMPDIR"
fi