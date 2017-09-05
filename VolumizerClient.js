
function VolumizerClient() {
  this.worker = new Worker('volumizer.worker.js');
  this.worker.tasks = {};
  this.worker.addEventListener('message', function downloadChecker(e) {
    var message = e.data;
    if (typeof message === 'string') message = JSON.parse(message);
    if (message.headline === 'download') {
      var link = document.createElement('A');
      link.href = URL.createObjectURL(message.file);
      link.setAttribute('download', message.file.name || 'file.dat');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  });
}

VolumizerClient.prototype = {
  close: function() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.tasks = null;
    }
  },
  task: function(def, callbacks) {
    if (typeof def === 'string') def = {headline:def};
    callbacks = callbacks || {};
    var worker = this.worker;
    return new Promise(function(resolve, reject) {
      var id;
      do {
        id = ('00000000' + ((Math.random() * 0x100000000) >>> 0).toString(16)).slice(-8);
      } while (id in worker.tasks);
      function onmessage(e) {
        var message = e.data;
        if (typeof message === 'string') message = JSON.parse(message);
        if (message.id !== id) return;
        if (message.headline === 'callback' && message.callback in callbacks) {
          callbacks[message.callback].apply(callbacks, message.args);
        }
        if (message.final) {
          worker.removeEventListener('message', onmessage);
          delete worker.tasks[id];
          if (message.headline === 'problem') {
            reject(message.problem);
          }
          else {
            resolve(message.result);
          }
        }
      }      
      worker.tasks[id] = onmessage;
      worker.addEventListener('message', onmessage);
      worker.postMessage(Object.assign({id:id}, def));
    });
  },
};
