
var volumizer = {};

volumizer.getDB = function getDB() {
  return this.gotDB = this.gotDB || new Promise(function(resolve, reject) {
    var opening = indexedDB.open('volumizer', 1);
    opening.onupgradeneeded = function() {
      var db = this.result;
      var transaction = this.transaction;

      var dataSources = db.createObjectStore('dataSources', {keyPath:'id', autoIncrement:true});
      dataSources.createIndex('byURL', 'url', {unique:true});

      var items = db.createObjectStore('items', {keyPath:'id', autoIncrement:true});
      items.createIndex('bySource', 'source', {unique:false});
      items.createIndex('byParent', 'parent', {unique:false});
      items.createIndex('byClass', 'classList', {multiEntry:true});
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

volumizer.extend_itemStore = {
  addModifiedKey: function(key) {
    if (!('modifiedKeys' in this)) {
      var modifiedKeys = this.modifiedKeys = [];
      this.transaction.addEventListener('complete', function(e) {
        modifiedKeys.sort(function(a,b){ return a-b; });
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
      e.preventImmediatePropagation();
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
      var itemStore = t.objectStore('items');
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
  self.dispatchEvent(new CustomEvent('task-counter', {detail:1}));
  return gotEntries.then(function(entries) {
    self.dispatchEvent(new CustomEvent('task-counter', {detail:-1}));
    self.dispatchEvent(new CustomEvent('task-counter', {detail:1}));
    return volumizer.withTransaction(['dataSources', 'items'], 'readwrite', function(t) {
      var dataSources = t.objectStore('dataSources');
      var items = t.objectStore('items');
      function doEntries(entries, parentKey) {
        entries.forEach(function(entry) {
          if (entry instanceof Blob) {
            dataSources.add({blob:entry}).onsuccess = function() {
              items.add({
                name: entry.name,
                classList: ['file'],
                mimeType: entry.type,
                source: this.result,
                sectors: '0,' + entry.size,
                parent: parentKey,
              }).onsuccess = function() {
                self.dispatchEvent(new CustomEvent('task-counter', {detail:-1}));
              };
            };
          }
          else {
            items.add({
              name: entry.name,
              classList: ['folder'],
              parent: parentKey,
            }).onsuccess = function() {
              self.dispatchEvent(new CustomEvent('task-counter', {detail:-1}));
              doEntries(entry, this.result);
            };
          }
        });
      }
      doEntries(entries, -1);
    })
    .then(function() {
      self.dispatchEvent(new CustomEvent('task-counter', {detail:-1}));
    });
  });
};

volumizer.getItems = function getItems(ids) {
  if (ids.length === 0) return Promise.resolve([]);
  var sorted = ids.slice().sort(function(a,b){ return a-b; });
  var range = IDBKeyRange.bound(sorted[0], sorted[sorted.length-1]);
  return volumizer.withTransaction(['items'], 'readonly', function(t) {
    return new Promise(function(resolve, reject) {
      var list = [], i = 0;
      t.objectStore('items').openCursor(range).onsuccess = function(e) {
        var cursor = this.result;
        if (!cursor) {
          resolve(list);
          return;
        }
        if (cursor.value.id === ids[i]) {
          list.push(cursor.value);
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
      t.objectStore('items').index('byParent').openCursor(parentKey).onsuccess = function(e) {
        var cursor = this.result;
        if (!cursor) {
          resolve(list);
          return;
        }
        list.push(cursor.value);
        cursor.continue();
      };
    });
  });
};

if ('document' in self) {
  volumizer.workers = []; // new Array(navigator.hardwareConcurrency || 1);
  for (var i = 0; i < volumizer.workers.length; i++) {
    var worker = volumizer.workers[i] = new Worker('volumizer.worker.js');
    worker.id = 'worker_' + i;
    worker.addEventListener('message', function(e) {
      self.dispatchEvent(new CustomEvent('volumizer-section-update', {
        detail: {sections: e.data.split(',').map(parseInt), worker:this.id},
      }));
    });
  }
  self.addEventListener('volumizer-section-update', function onupdate(e) {
    var sectionString = e.detail.sections.join(',');
    if (!e.detail.external) {
      self.localStorage.setItem('volumizer-section-update', sectionString);
      self.localStorage.removeItem('volumizer-section-update');
    }
    for (var i = 0; i < volumizer.workers.length; i++) {
      if (e.detail.worker !== volumizer.workers[i].id) {
        volumizer.workers[i].postMessage(sectionString);
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
