
var volumizer = {};

volumizer.getDB = function getDB() {
  return this.gotDB = this.gotDB || new Promise(function(resolve, reject) {
    var opening = indexedDB.open('volumizer', 1);
    opening.onupgradeneeded = function() {
      var db = this.result;
      var transaction = this.transaction;
      
      var workers = db.createObjectStore('workers', {keyPath:'id', autoIncrement:true});
      
      var tasks = db.createObjectStore('tasks', {keyPath:'id', autoIncrement:true});
      tasks.createIndex('byOperation', 'operation');
      tasks.createIndex('byWorker', 'worker');
      tasks.createIndex('byInputSource', 'inputSource', {multiEntry:true});
      tasks.createIndex('byInputItem', 'inputItem', {multiEntry:true});
      tasks.createIndex('byOutputSource', 'outputSource');
      tasks.createIndex('byOutputRootItem', 'outputRootItem');

      var dataSources = db.createObjectStore('dataSources', {keyPath:'id', autoIncrement:true});
      dataSources.createIndex('byURL', 'url', {unique:true});
      dataSources.createIndex('byOriginTask', 'originTask');

      var items = db.createObjectStore('items', {keyPath:'id', autoIncrement:true});
      items.createIndex('bySource', 'source', {unique:false});
      items.createIndex('byParent', 'parent', {unique:false});
      items.createIndex('byClass', 'classList', {multiEntry:true});
      items.createIndex('byOriginTask', 'originTask');
    };
    opening.onblocked = function() {
      delete volumizer.gotDB;
      reject('db blocked');
    };
    opening.onerror = function() {
      delete volumizer.gotDB;
      reject('db error');
    };
    opening.onsuccess = function() {
      var db = this.result;
      db.onclose = function() {
        delete volumizer.gotDB;
      };
      resolve(db);
    };
  });
};

volumizer.update = function(storeName, key, values) {
  return this.withTransaction([storeName], 'readwrite', function(t) {
    return new Promise(function(resolve, reject) {
      t.objectStore(storeName).openCursor(key).onsuccess = function(e) {
        var cursor = this.result;
        if (cursor) {
          var updated = Object.assign(cursor.value, values);
          cursor.update(updated);
          resolve(updated);
        }
        else {
          reject(storeName + '[' + key + '] not found');
        }
      };
    });
  });
};

volumizer.getSource = function getSource(id) {
  function doTransaction(t) {
    return new Promise(function(resolve, reject) {
      if (typeof id === 'string') {
        t.objectStore('sources').index('byURL').get(id).onsuccess = function(e) {
          if (this.result) {
            resolve(this.result);
          }
          else if (t.mode === 'readwrite') {
            var created = {url:id};
            t.objectStore('sources').add(created).onsuccess = function(e) {
              created.id = this.result;
              resolve(created);
            };
          }
          else {
            volumizer.withTransaction(['sources'], 'readwrite', doTransaction);
          }
        };
      }
      else {
        t.objectStore('sources').get(id).onsuccess = function(e) {
          resolve(this.result);
        };
      }
    });
  }
  return this.withTransaction(['sources'], 'readonly', doTransaction);
};

volumizer.getWorkerContext = function getWorkerContext() {
  return this.getDB().then(function(db) {
    return db.gotWorkerId = db.gotWorkerId || new Promise(function(resolve, reject) {
      var t = db.transaction(['workers'], 'readwrite');
      t.objectStore('workers').add({createdAt:new Date})
      .onsuccess = function(e) {
        resolve(this.result);
      };
    });
  });
};

volumizer.claimTaskTimeout = null;
volumizer.tryClaimTask = function tryClaimTask() {
  if (volumizer.claimTaskTimeout !== null) {
    clearTimeout(volumizer.claimTaskTimeout);
    volumizer.claimTaskTimeout = null;
  }
  function doTransaction(t, worker_id) {
    return new Promise(function(resolve, reject) {
      t.objectStore('tasks').index('byWorker').openCursor(-1)
      .onsuccess = function(e) {
        var cursor = this.result;
        if (!cursor) {
          resolve(null);
          return;
        }
        if (t.mode === 'readonly') {
          // upgrade to a writeable transaction
          resolve(volumizer.withTransaction(['tasks'], 'readwrite', function(t) {
            return doTransaction(t, worker_id);
          }));
          return;
        }
        var task = cursor.value;
        task.worker = worker_id;
        var e = new CustomEvent('volumizer-task-unclaimed', {detail:task, cancelable:true});
        if (!self.dispatchEvent(e)) {
          // preventDefault() was called, so this worker claims the task
          cursor.update(task);
          resolve(task);
        }
        else {
          cursor.continue();
        }
      };
    });
  }
  return volumizer.getWorkerContext().then(function(worker_id) {
    return volumizer.withTransaction(['tasks'], 'readonly', function(t) {
      return doTransaction(t, worker_id);
    })
    .then(function(task) {
      if (volumizer.claimTaskTimeout !== null) {
        clearTimeout(volumizer.claimTaskTimeout);
      }
      volumizer.claimTaskTimeout = self.setTimeout(volumizer.tryClaimTask, 200);
    });
  })
  .then(null, function(reason) {
    if (volumizer.claimTaskTimeout !== null) {
      clearTimeout(volumizer.claimTaskTimeout);
    }
    volumizer.claimTaskTimeout = self.setTimeout(volumizer.tryClaimTask, 200);
    return Promise.reject(reason);
  });
};

volumizer.extend_itemCursor = {
  delete: function() {
    if (typeof this.key !== 'undefined') {
      this.source.addModifiedKey(this.key);
    }
    return Object.getPrototypeOf(this).delete.apply(this, arguments);
  },
  update: function() {
    if (typeof this.key !== 'undefined') {
      this.source.addModifiedKey(this.key);
    }
    return Object.getPrototypeOf(this).update.apply(this, arguments);
  },
};

volumizer.extend_itemIndexCursor = {
  delete: function() {
    if (typeof this.primaryKey !== 'undefined') {
      this.source.objectStore.addModifiedKey(this.primaryKey);
    }
    return Object.getPrototypeOf(this).delete.apply(this, arguments);
  },
  update: function() {
    if (typeof this.primaryKey !== 'undefined') {
      this.source.objectStore.addModifiedKey(this.primaryKey);
    }
    return Object.getPrototypeOf(this).update.apply(this, arguments);
  },
};

volumizer.keyCmp = function(a, b) {
  // getting "illegal invocation" errors if passed
  // directly to [].sort()
  return indexedDB.cmp(a, b);
};

volumizer.extend_itemStore = {
  addModifiedKey: function(key) {
    if (!('modifiedKeys' in this)) {
      var modifiedKeys = this.modifiedKeys = [];
      this.transaction.addEventListener('complete', function(e) {
        modifiedKeys.sort(volumizer.keyCmp);
        self.dispatchEvent(new CustomEvent('volumizer-section-update', {
          detail: {sections: modifiedKeys},
        }));
      });
    }
    if (this.modifiedKeys.indexOf(key) === -1) {
      this.modifiedKeys.push(key);
    }
  },
  add: function() {
    var req = Object.getPrototypeOf(this).add.apply(this, arguments);
    req.addEventListener('success', function onsuccess() {
      this.source.addModifiedKey(this.result);
    });
    return req;
  },
  put: function() {
    var req = Object.getPrototypeOf(this).put.apply(this, arguments);
    req.addEventListener('success', function onsuccess() {
      this.source.addModifiedKey(this.result);
    });
    return req;
  },
  openCursor: function() {
    var cursing = Object.getPrototypeOf(this).openCursor.apply(this, arguments);
    cursing.addEventListener('success', function(e) {
      var cursor = this.result;
      if (cursor) {
        Object.assign(cursor, volumizer.extend_itemCursor);
      }
    });
    return cursing;
  },
  ondeletecursor: function(e) {
    var cursor = e.target.result;
    if (cursor) {
      e.stopImmediatePropagation();
      cursor.delete();
      cursor.continue();
    }
  },
  delete: function(keyOrRange) {
    var cursing = this.openCursor(keyOrRange);
    cursing.addEventListener('success', this.ondeletecursor);
    return cursing;
  },
  clear: function(keyOrRange) {
    var cursing = this.openCursor();
    cursing.addEventListener('success', this.ondeletecursor);
    return cursing;
  },
};

volumizer.extend_itemIndex = {
  openCursor: function() {
    var cursing = Object.getPrototypeOf(this).openCursor.apply(this, arguments);
    cursing.addEventListener('success', function(e) {
      var cursor = this.result;
      if (cursor) {
        Object.assign(cursor, volumizer.extend_itemIndexCursor);
      }
    });
    return cursing;
  },
};

volumizer.withTransaction = function openTransaction(storeNames, mode, fn) {
  if (typeof storeNames === 'string') storeNames = [storeNames];
  mode = mode || 'readonly';
  return this.getDB().then(function(db) {
    var t = db.transaction(storeNames, mode);
    if (mode !== 'readonly' && storeNames.indexOf('items') !== -1) {
      // t.itemStore in an attempt to prevent garbage collection
      // removing our customizations
      var itemStore = t.itemStore = t.objectStore('items');
      Object.assign(itemStore, volumizer.extend_itemStore);
      for (var i = 0; i < itemStore.indexNames.length; i++) {
        var itemIndex = itemStore.index(itemStore.indexNames[i]);
        Object.assign(itemIndex, volumizer.extend_itemIndex);
      }
    }
    return new Promise(function(resolve, reject) {
      t.addEventListener('complete', function() {
        resolve(this.result);
      });
      t.addEventListener('abort', function() {
        reject(this.error || 'transaction aborted');
      });
      t.result = fn(t);
    });
  });
};

volumizer.addToStore = function addToStore(storeName, def) {
  return this.withTransaction([storeName], 'readwrite', function(t) {
    return new Promise(function(resolve, reject) {
      t.objectStore(storeName).add(def)
      .onsuccess = function onsuccess(e) {
        resolve(this.result);
      };
    });
  });
};

volumizer.createTask = function createTask(def) {
  return this.addToStore('tasks', def);
};

volumizer.createSource = function createSource(def, parentItem) {
  return this.withTransaction(['dataSources', 'items', 'tasks'], 'readwrite', function(t) {
    return new Promise(function(resolve, reject) {
      t.objectStore('dataSources').add(def)
      .onsuccess = function(e) {
        def.id = this.result;
        if ('blob' in def && def.blob instanceof Blob) {
          resolve(def.id);
          return;
        }
        t.objectStore('tasks').add({
          operation: 'prime-source',
          source: def.id,
          item: parentItem || -1,
          worker: -1,
        })
        .onsuccess = function(e) {
          def.originTask = this.result;
          t.objectStore('dataSources').put(def);
          resolve(def.id);
        };
      };
    });
  });
};

volumizer.loadFromDataTransfer = function(dataTransfer) {
  var gotEntries;
  if (dataTransfer.items && dataTransfer.items[0] && 'webkitGetAsEntry' in dataTransfer.items[0]) {
    function gotFile(entry) {
      return new Promise(function(resolve, reject) {
        self.dispatchEvent(new CustomEvent('task-counter', {detail:1}));
        entry.file(function(file) {
          self.dispatchEvent(new CustomEvent('task-counter', {detail:-1}));
          resolve(file);
        },
        function(e) {
          self.dispatchEvent(new CustomEvent('task-counter', {detail:-1}));
          reject(e);
        });
      });
    }
    function readDir(name, dirReader, list) {
      return new Promise(function(resolve, reject) {
        dirReader.readEntries(function(entries) {
          if (entries.length === 0) {
            resolve(Promise.all(list).then(function(list) {
              list.name = name;
              return list;
            }));
            return;
          }
          self.dispatchEvent(new CustomEvent('task-counter', {detail:entries.length}));
          for (var i = 0; i < entries.length; i++) {
            var entry = entries[i];
            if (entry.isDirectory) {
              list.push(readDir(entry.name, entry.createReader(), []));
            }
            else {
              list.push(gotFile(entry));
            }
          }
          resolve(readDir(name, dirReader, list));
        },
        function(e) {
          reject(e);
        });
      });
    }
    gotEntries = [];
    self.dispatchEvent(new CustomEvent('task-counter', {detail:dataTransfer.items.length}));
    for (var i = 0; i < dataTransfer.items.length; i++) {
      var entry = dataTransfer.items[i].webkitGetAsEntry();
      if (entry.isDirectory) {
        gotEntries.push(readDir(entry.name, entry.createReader(), []));
      }
      else {
        gotEntries.push(gotFile(entry));
      }
    }
    gotEntries = Promise.all(gotEntries);
  }
  else {
    gotEntries = Promise.resolve(dataTransfer.files || []);
  }
  return gotEntries.then(function(entries) {
    function doEntries(entries, parentKey) {
      function doEntry(entry, parentKey) {
        if (entry instanceof Blob) {
          return volumizer.withTransaction(['dataSources', 'items'], 'readwrite', function(t) {
            t.objectStore('dataSources').add({blob:entry})
            .onsuccess = function() {
              t.objectStore('items').add({
                name: entry.name,
                classList: ['file'],
                mimeType: entry.type,
                source: this.result,
                sectors: '0,' + entry.size,
                parent: parentKey,
              });
            };
          })
          .then(function() {
            self.dispatchEvent(new CustomEvent('task-counter', {detail:-1}));
          });
        }
        return volumizer.withTransaction(['items'], 'readwrite', function(t) {
          return new Promise(function(resolve, reject) {
            t.objectStore('items').add({
              name: entry.name,
              classList: ['folder'],
              parent: parentKey,
            })
            .onsuccess = function() {
              resolve(this.result);
            };
          });
        })
        .then(function(id) {
          self.dispatchEvent(new CustomEvent('task-counter', {detail:-1}));
          return doEntries(entry, id);
        });
      }
      var promiseChain = Promise.resolve();
      for (var i = 0; i < entries.length; i++) {
        promiseChain = promiseChain.then(doEntry.bind(null, entries[i], parentKey));
      }
      return promiseChain;
    }
    return doEntries(entries, -1);
  });
};

volumizer.getItems = function getItems(ids) {
  if (ids.length === 0) return Promise.resolve([]);
  ids = ids.slice().sort(volumizer.keyCmp);
  var range = IDBKeyRange.bound(ids[0], ids[ids.length-1]);
  return volumizer.withTransaction(['items'], 'readonly', function(t) {
    return new Promise(function(resolve, reject) {
      var list = [], i = 0;
      var itemStore = t.objectStore('items');
      var byParent = itemStore.index('byParent');
      itemStore.openCursor(range).onsuccess = function(e) {
        var cursor = this.result;
        if (!cursor) {
          resolve(list);
          return;
        }
        var entry = cursor.value;
        if (entry.id === ids[i]) {
          list.push(entry);
          byParent.count(entry.id).onsuccess = function() {
            entry.childCount = this.result;
          };
          if (++i >= ids.length) {
            resolve(list);
          }
          else {
            cursor.continue(ids[i]);
          }
        }
        else if (cursor.value.id < ids[i]) {
          cursor.continue(ids[i]);
        }
        else if (++i >= ids.length) {
          resolve(list);
        }
        else {
          cursor.continue(ids[i]);
        }
      };
    });
  });
};

volumizer.getItemsIn = function getItems(parentKey) {
  return volumizer.withTransaction(['items'], 'readonly', function(t) {
    return new Promise(function(resolve, reject) {
      var list = [];
      var byParent = t.objectStore('items').index('byParent');
      byParent.openCursor(parentKey).onsuccess = function(e) {
        var cursor = this.result;
        if (!cursor) {
          resolve(list);
          return;
        }
        var entry = cursor.value;
        list.push(entry);
        byParent.count(cursor.value.id).onsuccess = function() {
          entry.childCount = this.result;
        };
        cursor.continue();
      };
    });
  });
};

volumizer.deleteItems = function deleteItems(ids) {
  return volumizer.withTransaction(['items', 'dataSources'], 'readwrite', function(t) {
    ids = ids.slice().sort(volumizer.keyCmp);
    var range = IDBKeyRange.bound(ids[0], ids[ids.length-1]);
    var itemStore = t.objectStore('items');
    var sourceStore = t.objectStore('dataSources');
    var sourceList = [];
    var byParent = itemStore.index('byParent');
    var count = 1;
    function deleteSources() {
      if (sourceList.length === 0) return;
      sourceList.sort(volumizer.keyCmp);
      range = IDBKeyRange.bound(sourceList[0], sourceList[sourceList.length-1]);
      itemStore.index('bySource').openCursor(range).onsuccess = function(e) {
        var cursor = this.result;
        if (!cursor) for (var i = 0; i < sourceList.length; i++) {
          sourceStore.delete(sourceList[i]);
        }
        else do {
          var diff = indexedDB.cmp(sourceList[0], cursor.value.source);
          if (diff >= 0) {
            if (diff === 0) {
              sourceList.shift();
            }
            if (sourceList.length > 0) {
              cursor.continue(sourceList[0]);
            }
            break;
          }
          sourceStore.delete(sourceList.shift());
        } while (sourceList.length > 0);
      };
    }
    function deleteSuccess() {
      if (--count === 0) deleteSources();
    }
    function recurseDelete(e) {
      var cursor = e.target.result;
      if (!cursor) {
        if (--count === 0) deleteSources();
        return;
      }
      var entry = cursor.value;
      if (typeof entry.source === 'number' && sourceList.indexOf(entry.source) === -1) {
        sourceList.push(entry.source);
      }
      count++;
      byParent.openCursor(entry.id).onsuccess = recurseDelete;
      count++;
      cursor.delete().onsuccess = deleteSuccess;
      cursor.continue();
    }
    itemStore.openCursor(range).onsuccess = function(e) {
      var cursor = this.result;
      if (cursor) {
        var entry = cursor.value;
        do {
          var diff = indexedDB.cmp(ids[0], entry.id);
          if (diff < 0) {
            ids.shift();
            continue;
          }
          else if (diff > 0) {
            cursor.continue(ids[0]);
            return;
          }
          else break;
        } while (ids.length > 0);
        if (ids.length > 0) {
          if (typeof entry.source === 'number' && sourceList.indexOf(entry.source) === -1) {
            sourceList.push(entry.source);
          }
          count++;
          byParent.openCursor(entry.id).onsuccess = recurseDelete;
          count++;
          cursor.delete().onsuccess = deleteSuccess;
          ids.shift();
          if (ids.length > 0) {
            cursor.continue(ids[0]);
            return;
          }
        }
      }
      if (--count === 0) deleteSources();
    };
  });
};

volumizer.getItemBlob = function getItemBlob(id) {
  return volumizer.withTransaction(['items', 'dataSources'], 'readonly', function(t) {
    return new Promise(function(resolve, reject) {
      t.objectStore('items').get(id).onsuccess = function(e) {
        if (!(this.result && 'source' in this.result)) {
          resolve();
          return;
        }
        var source = this.result.source, sectors = this.result.sectors;
        var from = t.objectStore('dataSources');
        if (typeof source === 'string') {
          from = from.index('byURL');
        }
        from.get(source).onsuccess = function(e) {
          if (!(this.result && 'blob' in this.result)) {
            resolve();
            return;
          }
          var blob = this.result.blob;
          sectors = sectors || ('0,'+blob.size);
          if (sectors !== ('0,'+blob.size)) {
            blob = new Blob(sectors.split(';').map(function(section) {
              section = section.split(',').map(parseInt);
              return blob.slice(section[0], section[0] + section[1]);
            }));
          }
          resolve(blob);
        };
      };
    });
  });  
};

if ('document' in self) {
  volumizer.localWorkers = [];
  volumizer.spawnWorker = function() {
    var worker = new Worker('volumizer.worker.js');
    worker.addEventListener('message', function(e) {
      self.dispatchEvent(new CustomEvent('volumizer-section-update', {
        detail: {sections: e.data.split(',').map(parseInt)},
      }));
    });
    worker.postMessage({
      headline: 'init',
    });
    return worker;
  };
  self.addEventListener('volumizer-section-update', function onupdate(e) {
    var sectionString = e.detail.sections.join(',');
    if (!e.detail.external) {
      self.localStorage.setItem('volumizer-section-update', sectionString);
      self.localStorage.removeItem('volumizer-section-update');
    }
    for (var i = 0; i < volumizer.localWorkers.length; i++) {
      if (e.detail.worker !== volumizer.localWorkers[i].id) {
        volumizer.localWorkers[i].postMessage(sectionString);
      }
    }
  });
  self.addEventListener('storage', function onstorage(e) {
    if (e.key === 'volumizer-section-update' && e.newValue !== null) {
      self.dispatchEvent(new CustomEvent('volumizer-section-update', {
        detail: {sections: e.newValue.split(',').map(parseInt), external:true},
      }));
    }
  });
}
else {
  self.addEventListener('volumizer-section-update', function onupdate(e) {
    if (!e.detail.external) {
      self.postMessage(e.detail.sections.join(','));
    }
  });
  self.addEventListener('message', function(e) {
    if (typeof e.data === 'string') {
      self.dispatchEvent(new CustomEvent('volumizer-section-update', {
        detail: {sections: e.split(',').map(parseInt), external: true},
      }));
    }
  });
}
