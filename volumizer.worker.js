
importScripts('volumizer.js');

volumizer.withTransaction(['workers'], 'readwrite', function(t) {
  return new Promise(function(resolve, reject) {
    t.objectStore('workers')
      .add({createdAt:new Date()})
      .onsuccess = function(e) {
        resolve(e.result);
      };
  });
})
.then(function(id) {
  self.postMessage('{"headline":"init", "id":' + id + '}');
});

self.onmessage = function onmessage(e) {
  var message = e.data;
};
