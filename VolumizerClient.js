
function VolumizerClient(worker) {
  this.worker = worker = worker || new Worker('volumizer.worker.js');
  worker.tasks = worker.tasks || Object.create(null);
}

VolumizerClient.prototype = {
  task: function(def, callbacks) {
    var worker = this.worker;
    return new Promise(function(resolve, reject) {
      var id;
      do {
        id = ('00000000' + ((Math.random() * 0x100000000) >>> 0).toString(16)).slice(-8);
      } while (id in worker.tasks);
      function onmessage(e) {
        var message = e.data;
        if (message.id !== id) return;
        var callback = 'on'+message.headline;
        if (callback in callbacks) {
          delete message.id;
          callbacks[callback].apply(callbacks, message);
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
