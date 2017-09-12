
var volumizer = {};

volumizer.getDB = function getDB() {
  return this.gotDB = this.gotDB || new Promise(function(resolve, reject) {
    var opening = indexedDB.open('volumizer', 1);
    opening.onupgradeneeded = function() {
      var db = this.result;
      var transaction = this.transaction;

      var dataSources = db.createObjectStore('dataSources', {keyPath:'id', autoIncrement:true});
      dataSources.createIndex('byURL', 'url', {unique:true});
      transaction.objectStore('dataSources').add({url:'meta:null', blob:new Blob([])});

      var dataSections = transaction.createObjectStore('dataSections', {keyPath:'id', autoIncrement:true});
      dataSections.createIndex('bySource', 'source', {unique:false});
      dataSections.createIndex('byParent', 'parent', {unique:false});
      dataSections.createIndex('byClass', 'classList', {multiEntry:true});
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

volumizer.extend_dataSectionCursor = {
  delete: function() {
    this.source.addModifiedKey(this.key);
    return this.prototype.delete.apply(this, arguments);
  },
  update: function() {
    this.source.addModifiedKey(this.key);
    return this.prototype.update.apply(this, arguments);
  },
};

volumizer.extend_dataSectionStore = {
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
    var dataSections = e.target.objectStore('dataSections');
    self.dispatchEvent(new CustomEvent('volumizer-section-update', {
      detail: {sections: dataSections.modifiedKeys},
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
        Object.assign(cursor, volumizer.extend_dataSectionCursor);
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

volumizer.withTransaction = function openTransaction(storeNames, mode, fn) {
  if (typeof storeNames === 'string') storeNames = [storeNames];
  mode = mode || 'readonly';
  return this.getDB().then(function(db) {
    var t = db.transaction(storeNames, mode);
    if (mode !== 'readonly' && storeNames.indexOf('dataSections') !== -1) {
      Object.assign(t.objectStore('dataSections'), volumizer.extend_dataSectionStore);
    }
    return new Promise(function(resolve, reject) {
      t.addEventListener('complete', function() {
        resolve(this.result);
      });
      t.addEventListener('abort', function() {
        reject(this.error);
      });
      t.result = fn(t);
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
      });
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
