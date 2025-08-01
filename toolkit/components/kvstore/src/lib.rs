/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

extern crate atomic_refcell;
extern crate crossbeam_utils;
#[macro_use]
extern crate cstr;
extern crate libc;
extern crate log;
extern crate moz_task;
extern crate nserror;
extern crate nsstring;
extern crate rkv;
extern crate storage_variant;
extern crate tempfile;
extern crate thin_vec;
extern crate thiserror;
extern crate xpcom;

mod error;
mod fs;
mod owned_value;
pub mod skv;
mod task;

use atomic_refcell::AtomicRefCell;
use error::KeyValueError;
use libc::c_void;
use moz_task::{create_background_task_queue, DispatchOptions, TaskRunnable};
use nserror::{nsresult, NS_ERROR_FAILURE, NS_ERROR_NOT_IMPLEMENTED, NS_OK};
use nsstring::{nsACString, nsAString, nsCString, nsString};
use owned_value::{owned_to_variant, variant_to_owned};
use rkv::backend::{RecoveryStrategy, SafeModeDatabase, SafeModeEnvironment};
use rkv::OwnedValue;
use std::{
    ptr,
    sync::{Arc, RwLock},
    vec::IntoIter,
};
use task::{
    ClearTask, DeleteTask, EnumerateTask, GetOrCreateWithOptionsTask, GetTask, HasTask, PutTask,
    WriteManyTask,
};
use thin_vec::ThinVec;
use xpcom::{
    getter_addrefs,
    interfaces::{
        nsIKeyValueDatabaseCallback, nsIKeyValueEnumeratorCallback, nsIKeyValueImporter,
        nsIKeyValuePair, nsIKeyValueService, nsIKeyValueVariantCallback, nsIKeyValueVoidCallback,
        nsISerialEventTarget, nsIVariant,
    },
    nsIID, xpcom, xpcom_method, RefPtr,
};

type Rkv = rkv::Rkv<SafeModeEnvironment>;
type SingleStore = rkv::SingleStore<SafeModeDatabase>;
type KeyValuePairResult = Result<(String, OwnedValue), KeyValueError>;

#[no_mangle]
pub unsafe extern "C" fn nsKeyValueServiceConstructor(
    iid: &nsIID,
    result: *mut *mut c_void,
) -> nsresult {
    *result = ptr::null_mut();

    let service = KeyValueService::new();
    service.QueryInterface(iid, result)
}

// For each public XPCOM method in the nsIKeyValue* interfaces, we implement
// a pair of Rust methods:
//
//   1. a method named after the XPCOM (as modified by the XPIDL parser, i.e.
//      by capitalization of its initial letter) that returns an nsresult;
//
//   2. a method with a Rust-y name that returns a Result<(), KeyValueError>.
//
// XPCOM calls the first method, which is only responsible for calling
// the second one and converting its Result to an nsresult (logging errors
// in the process).  The second method is responsible for doing the work.
//
// For example, given an XPCOM method FooBar, we implement a method FooBar
// that calls a method foo_bar.  foo_bar returns a Result<(), KeyValueError>,
// and FooBar converts that to an nsresult.
//
// This design allows us to use Rust idioms like the question mark operator
// to simplify the implementation in the second method while returning XPCOM-
// compatible nsresult values to XPCOM callers.
//
// The XPCOM methods are implemented using the xpcom_method! declarative macro
// from the xpcom crate.

#[xpcom(implement(nsIKeyValueService), atomic)]
pub struct KeyValueService {}

impl KeyValueService {
    fn new() -> RefPtr<KeyValueService> {
        KeyValueService::allocate(InitKeyValueService {})
    }

    xpcom_method!(
        get_or_create => GetOrCreate(
            callback: *const nsIKeyValueDatabaseCallback,
            path: *const nsAString,
            name: *const nsACString
        )
    );

    fn get_or_create(
        &self,
        callback: &nsIKeyValueDatabaseCallback,
        path: &nsAString,
        name: &nsACString,
    ) -> Result<(), nsresult> {
        let task = Box::new(GetOrCreateWithOptionsTask::new(
            RefPtr::new(callback),
            nsString::from(path),
            nsCString::from(name),
            RecoveryStrategy::Error,
        ));

        TaskRunnable::new("KVService::GetOrCreate", task)?
            .dispatch_background_task_with_options(DispatchOptions::default().may_block(true))
    }

    xpcom_method!(
        get_or_create_with_options => GetOrCreateWithOptions(
            callback: *const nsIKeyValueDatabaseCallback,
            path: *const nsAString,
            name: *const nsACString,
            strategy: u8
        )
    );

    fn get_or_create_with_options(
        &self,
        callback: &nsIKeyValueDatabaseCallback,
        path: &nsAString,
        name: &nsACString,
        xpidl_strategy: u8,
    ) -> Result<(), nsresult> {
        let strategy = match xpidl_strategy {
            nsIKeyValueService::ERROR => RecoveryStrategy::Error,
            nsIKeyValueService::DISCARD => RecoveryStrategy::Discard,
            nsIKeyValueService::RENAME => RecoveryStrategy::Rename,
            _ => return Err(NS_ERROR_FAILURE),
        };
        let task = Box::new(GetOrCreateWithOptionsTask::new(
            RefPtr::new(callback),
            nsString::from(path),
            nsCString::from(name),
            strategy,
        ));

        TaskRunnable::new("KVService::GetOrCreateWithOptions", task)?
            .dispatch_background_task_with_options(DispatchOptions::default().may_block(true))
    }

    xpcom_method!(
        create_importer => CreateImporter(
            type_: *const nsACString,
            path: *const nsAString
        ) -> *const nsIKeyValueImporter
    );

    fn create_importer(
        &self,
        _type: &nsACString,
        _path: &nsAString,
    ) -> Result<RefPtr<nsIKeyValueImporter>, nsresult> {
        Err(nserror::NS_ERROR_NOT_IMPLEMENTED)
    }
}

#[xpcom(implement(nsIKeyValueDatabase), atomic)]
pub struct KeyValueDatabase {
    rkv: Arc<RwLock<Rkv>>,
    store: SingleStore,
    queue: RefPtr<nsISerialEventTarget>,
}

impl KeyValueDatabase {
    fn new(
        rkv: Arc<RwLock<Rkv>>,
        store: SingleStore,
    ) -> Result<RefPtr<KeyValueDatabase>, KeyValueError> {
        let queue = create_background_task_queue(cstr!("KeyValueDatabase"))?;
        Ok(KeyValueDatabase::allocate(InitKeyValueDatabase {
            rkv,
            store,
            queue,
        }))
    }

    xpcom_method!(
        is_empty => IsEmpty(
            callback: *const nsIKeyValueVariantCallback
        )
    );

    fn is_empty(&self, _callback: &nsIKeyValueVariantCallback) -> Result<(), nsresult> {
        Err(NS_ERROR_NOT_IMPLEMENTED)
    }

    xpcom_method!(
        count => Count(
            callback: *const nsIKeyValueVariantCallback
        )
    );

    fn count(&self, _callback: &nsIKeyValueVariantCallback) -> Result<(), nsresult> {
        Err(NS_ERROR_NOT_IMPLEMENTED)
    }

    xpcom_method!(
        size => Size(
            callback: *const nsIKeyValueVariantCallback
        )
    );

    fn size(&self, _callback: &nsIKeyValueVariantCallback) -> Result<(), nsresult> {
        Err(NS_ERROR_NOT_IMPLEMENTED)
    }

    xpcom_method!(
        put => Put(
            callback: *const nsIKeyValueVoidCallback,
            key: *const nsACString,
            value: *const nsIVariant
        )
    );

    fn put(
        &self,
        callback: &nsIKeyValueVoidCallback,
        key: &nsACString,
        value: &nsIVariant,
    ) -> Result<(), nsresult> {
        let value = variant_to_owned(value)?.ok_or(KeyValueError::UnexpectedValue)?;

        let task = Box::new(PutTask::new(
            RefPtr::new(callback),
            Arc::clone(&self.rkv),
            self.store,
            nsCString::from(key),
            value,
        ));

        TaskRunnable::dispatch(TaskRunnable::new("KVDatabase::Put", task)?, &self.queue)
    }

    xpcom_method!(
        write_many => WriteMany(
            callback: *const nsIKeyValueVoidCallback,
            pairs: *const ThinVec<Option<RefPtr<nsIKeyValuePair>>>
        )
    );

    fn write_many(
        &self,
        callback: &nsIKeyValueVoidCallback,
        pairs: &ThinVec<Option<RefPtr<nsIKeyValuePair>>>,
    ) -> Result<(), nsresult> {
        let mut entries = Vec::with_capacity(pairs.len());

        for pair in pairs {
            let pair = pair
                .as_ref()
                .ok_or(nsresult::from(KeyValueError::UnexpectedValue))?;

            let mut key = nsCString::new();
            unsafe { pair.GetKey(&mut *key) }.to_result()?;
            if key.is_empty() {
                return Err(nsresult::from(KeyValueError::UnexpectedValue));
            }

            let val: RefPtr<nsIVariant> = getter_addrefs(|p| unsafe { pair.GetValue(p) })?;
            let value = variant_to_owned(&val)?;
            entries.push((key, value));
        }

        let task = Box::new(WriteManyTask::new(
            RefPtr::new(callback),
            Arc::clone(&self.rkv),
            self.store,
            entries,
        ));

        TaskRunnable::dispatch(
            TaskRunnable::new("KVDatabase::WriteMany", task)?,
            &self.queue,
        )
    }

    xpcom_method!(
        get => Get(
            callback: *const nsIKeyValueVariantCallback,
            key: *const nsACString,
            default_value: *const nsIVariant
        )
    );

    fn get(
        &self,
        callback: &nsIKeyValueVariantCallback,
        key: &nsACString,
        default_value: &nsIVariant,
    ) -> Result<(), nsresult> {
        let task = Box::new(GetTask::new(
            RefPtr::new(callback),
            Arc::clone(&self.rkv),
            self.store,
            nsCString::from(key),
            variant_to_owned(default_value)?,
        ));

        TaskRunnable::dispatch(TaskRunnable::new("KVDatabase::Get", task)?, &self.queue)
    }

    xpcom_method!(
        has => Has(callback: *const nsIKeyValueVariantCallback, key: *const nsACString)
    );

    fn has(&self, callback: &nsIKeyValueVariantCallback, key: &nsACString) -> Result<(), nsresult> {
        let task = Box::new(HasTask::new(
            RefPtr::new(callback),
            Arc::clone(&self.rkv),
            self.store,
            nsCString::from(key),
        ));

        TaskRunnable::dispatch(TaskRunnable::new("KVDatabase::Has", task)?, &self.queue)
    }

    xpcom_method!(
        delete => Delete(callback: *const nsIKeyValueVoidCallback, key: *const nsACString)
    );

    fn delete(&self, callback: &nsIKeyValueVoidCallback, key: &nsACString) -> Result<(), nsresult> {
        let task = Box::new(DeleteTask::new(
            RefPtr::new(callback),
            Arc::clone(&self.rkv),
            self.store,
            nsCString::from(key),
        ));

        TaskRunnable::dispatch(TaskRunnable::new("KVDatabase::Delete", task)?, &self.queue)
    }

    xpcom_method!(
        delete_range => DeleteRange(
            callback: *const nsIKeyValueVoidCallback,
            from_key: *const nsACString,
            to_key: *const nsACString
        )
    );

    fn delete_range(
        &self,
        _callback: &nsIKeyValueVoidCallback,
        _from_key: &nsACString,
        _to_key: &nsACString,
    ) -> Result<(), nsresult> {
        Err(NS_ERROR_NOT_IMPLEMENTED)
    }

    xpcom_method!(
        clear => Clear(callback: *const nsIKeyValueVoidCallback)
    );

    fn clear(&self, callback: &nsIKeyValueVoidCallback) -> Result<(), nsresult> {
        let task = Box::new(ClearTask::new(
            RefPtr::new(callback),
            Arc::clone(&self.rkv),
            self.store,
        ));

        TaskRunnable::dispatch(TaskRunnable::new("KVDatabase::Clear", task)?, &self.queue)
    }

    xpcom_method!(
        enumerate => Enumerate(
            callback: *const nsIKeyValueEnumeratorCallback,
            from_key: *const nsACString,
            to_key: *const nsACString
        )
    );

    fn enumerate(
        &self,
        callback: &nsIKeyValueEnumeratorCallback,
        from_key: &nsACString,
        to_key: &nsACString,
    ) -> Result<(), nsresult> {
        let task = Box::new(EnumerateTask::new(
            RefPtr::new(callback),
            Arc::clone(&self.rkv),
            self.store,
            nsCString::from(from_key),
            nsCString::from(to_key),
        ));

        TaskRunnable::dispatch(
            TaskRunnable::new("KVDatabase::Enumerate", task)?,
            &self.queue,
        )
    }

    xpcom_method!(
        close => Close(
            callback: *const nsIKeyValueVoidCallback
        )
    );

    fn close(&self, _callback: &nsIKeyValueVoidCallback) -> Result<(), nsresult> {
        Err(NS_ERROR_NOT_IMPLEMENTED)
    }
}

#[xpcom(implement(nsIKeyValueEnumerator), atomic)]
pub struct KeyValueEnumerator {
    iter: AtomicRefCell<IntoIter<KeyValuePairResult>>,
}

impl KeyValueEnumerator {
    fn new(pairs: Vec<KeyValuePairResult>) -> RefPtr<KeyValueEnumerator> {
        KeyValueEnumerator::allocate(InitKeyValueEnumerator {
            iter: AtomicRefCell::new(pairs.into_iter()),
        })
    }

    xpcom_method!(has_more_elements => HasMoreElements() -> bool);

    fn has_more_elements(&self) -> Result<bool, KeyValueError> {
        Ok(!self.iter.borrow().as_slice().is_empty())
    }

    xpcom_method!(get_next => GetNext() -> *const nsIKeyValuePair);

    fn get_next(&self) -> Result<RefPtr<nsIKeyValuePair>, KeyValueError> {
        let mut iter = self.iter.borrow_mut();
        let (key, value) = iter
            .next()
            .ok_or_else(|| KeyValueError::from(NS_ERROR_FAILURE))??;

        // We fail on retrieval of the key/value pair if the key isn't valid
        // UTF-*, if the value is unexpected, or if we encountered a store error
        // while retrieving the pair.
        Ok(RefPtr::new(
            KeyValuePair::new(key, value).coerce::<nsIKeyValuePair>(),
        ))
    }
}

#[xpcom(implement(nsIKeyValuePair), atomic)]
pub struct KeyValuePair {
    key: String,
    value: OwnedValue,
}

impl KeyValuePair {
    fn new(key: String, value: OwnedValue) -> RefPtr<KeyValuePair> {
        KeyValuePair::allocate(InitKeyValuePair { key, value })
    }

    xpcom_method!(get_key => GetKey() -> nsACString);
    xpcom_method!(get_value => GetValue() -> *const nsIVariant);

    fn get_key(&self) -> Result<nsCString, KeyValueError> {
        Ok(nsCString::from(&self.key))
    }

    fn get_value(&self) -> Result<RefPtr<nsIVariant>, KeyValueError> {
        owned_to_variant(self.value.clone())
    }
}
