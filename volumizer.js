
var volumizer = {};

volumizer.getDB = function getDB() {
  return this.gotDB = this.gotDB || new Promise(function(resolve, reject) {
    var opening = indexedDB.open('volumizer', 1);
    opening.onupgradeneeded = function() {
      var db = this.result;
      var transaction = this.transaction;

      var dataSources = db.createObjectStore('dataSources', {keyPath:'id', autoIncrement:true});
      dataSources.createIndex('byURL', 'url', {unique:true});

      var items = transaction.createObjectStore('items', {keyPath:'id', autoIncrement:true});
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
    return this.prototype.delete.apply(this, arguments);
  },
  update: function() {
    if (typeof this.key !== 'undefined') {
      this.source.addModifiedKey(this.key);
    }
    return this.prototype.update.apply(this, arguments);
  },
};

volumizer.extend_itemIndexCursor = {
  delete: function() {
    if (typeof this.primaryKey !== 'undefined') {
      this.source.objectStore.addModifiedKey(this.primaryKey);
    }
    return this.prototype.delete.apply(this, arguments);
  },
  update: function() {
    if (typeof this.primaryKey !== 'undefined') {
      this.source.objectStore.addModifiedKey(this.primaryKey);
    }
    return this.prototype.update.apply(this, arguments);
  },
};

volumizer.extend_itemStore = {
  addModifiedKey: function(key) {
    if (!('modifiedKeys' in this)) {
      this.modifiedKeys = [];
      this.transaction.addEventListener('complete', this.onmodifiedkeys);
    }
    if (this.modifiedKeys.indexOf(key) === -1) {
      this.modifiedKeys.push(key);
    }
  },
  onmodifiedkeys: function(e) {
    var items = e.target.objectStore('items');
    self.dispatchEvent(new CustomEvent('volumizer-section-update', {
      detail: {sections: items.modifiedKeys},
    }));
  },
  add: function() {
    var req = this.prototype.add.apply(this, arguments);
    req.addEventListener('success', function onsuccess() {
      this.source.addModifiedKey(this.result);
    });
    return req;
  },
  put: function() {
    var req = this.prototype.put.apply(this, arguments);
    req.addEventListener('success', function onsuccess() {
      this.source.addModifiedKey(this.result);
    });
    return req;
  },
  openCursor: function() {
    var cursing = this.prototype.openCursor.apply(this, arguments);
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
    var cursing = this.prototype.openCursor.apply(this, arguments);
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
        entry.file(function(file) {
          resolve(file);
        },
        function(e) {
          reject(e);
        });
      });
    }
    function readDir(name, dirReader, list) {
      return new Promise(function(resolve, reject) {
        dirReader.readEntries(function(entries) {
          if (entries.length === 0) {
            Promise.all(list).then(function(list) {
              list.name = name;
              return list;
            });
            return;
          }
          for (var i = 0; i < entries.length; i++) {
            var entry = entries[i];
            if (entry.isDirectory) {
              list.push(readDir(entry.name, entry.createReader(), []));
            }
            else {
              list.push(gotFile(entry));
            }
          }
          return readDir(name, dirReader, list);
        },
        function(e) {
          reject(e);
        });
      });
    }
    gotEntries = [];
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
    return volumizer.withTransaction(['dataSources', 'items'], 'readwrite', function(t) {
      var dataSources = t.objectStore('dataSources');
      var items = t.objectStore('items');
      function doEntries(entries, parentKey) {
        entries.forEach(function(entries) {
          if (entry instanceof Blob) {
            dataSources.add({blob:entries[i]}).onsuccess = function() {
              items.add({
                name: entry.name,
                classList: ['file'],
                mimeType: entry.type,
                source: this.result,
                sectors: '0,' + entry.size,
                parent: parentKey,
              });
            };
          }
          else {
            items.add({
              name: entry.name,
              classList: ['folder'],
              parent: parentKey,
            }).onsuccess = function() {
              doEntries(entry, this.result);
            };
          }
        });
      }
      doEntries(entries, null);
    });
  });
};

if ('document' in self) {
  volumizer.workers = new Array(navigator.hardwareConcurrency || 1);
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
      });
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
      });
    }
  });
}