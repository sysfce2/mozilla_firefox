/*
 * Copyright 2011 Google Inc.
 * Copyright 2012 Mozilla Foundation
 *
 * Use of this source code is governed by a BSD-style license that can be
 * found in the LICENSE file.
 */

#include "include/private/base/SkMalloc.h"

#include "include/core/SkTypes.h"
#include "mozilla/mozalloc.h"
#include "mozilla/mozalloc_abort.h"
#include "mozilla/mozalloc_oom.h"
#include "prenv.h"

bool sk_abort_is_enabled() {
#ifdef SK_DEBUG
    const char* env = PR_GetEnv("MOZ_SKIA_DISABLE_ASSERTS");
    if (env && *env != '0') {
        return false;
    }
#endif
    return true;
}

// needed for std::max
#include <algorithm>

void sk_abort_no_print() {
    mozalloc_abort("Abort from sk_abort");
}

void sk_out_of_memory(void) {
    SkDEBUGFAIL("sk_out_of_memory");
    mozalloc_handle_oom(0);
}

void sk_free(void* p) {
    free(p);
}

void* sk_realloc_throw(void* addr, size_t size) {
    return moz_xrealloc(addr, size);
}

void* sk_malloc_flags(size_t size, unsigned flags) {
    if (flags & SK_MALLOC_ZERO_INITIALIZE) {
        return (flags & SK_MALLOC_THROW) ? moz_xcalloc(size, 1) : calloc(size, 1);
    }
    return (flags & SK_MALLOC_THROW) ? moz_xmalloc(size) : malloc(size);
}

size_t sk_malloc_size(void* addr, size_t size) {
    return std::max(moz_malloc_usable_size(addr), size);
}
