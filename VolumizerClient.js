
function VolumizerClient() {
  this.worker = new Worker('volumizer.worker.js');
  this.worker.postMessage({
    headline: 'routing',
    routing: [
      {
        endpoint: 'mac/hfs',
        data: /^.{1024}BD.{510,}/,
        ext: ['cdr', 'iso', 'toast', 'dsk', 'img', 'image'],
      },
      {
        endpoint: 'mac/mfs',
        data: /^.{1024}\xD2\xD7.{510,}/,
        ext: ['dsk', 'img', 'image'],
      },
      {
        endpoint: 'mac/partitioned',
        data: /^.{512}PM.{510,}PM.{510,}/,
        ext: ['cdr', 'iso', 'toast', 'dsk', 'img', 'image'],
      },
      {
        endpoint: 'mac/stuffit-pre5',
        data: /^SIT!/,
        ext: 'sit',
        type: 'application/x-stuffit-compressed',
      },
      {
        endpoint: 'mac/stuffit-5',
        data: /^StuffIt (c)1997-\d{4} Aladdin Systems, Inc\./,
        ext: 'sit',
        type: 'application/x-stuffit-compressed',
      },
      {
        endpoint: 'mac/hqx-encoded',
        data: /(?:^|\r|\n])\(This file must be converted with BinHex[^\r\n]+[\r\n]+ *:([!-,\-0-9@A-Z\[`a-r]+\s*)+:/,
        ext: 'hqx',
      },
    ],
  });
  this.worker.tasks = {};
  this.worker.addEventListener('message', function downloadChecker(e) {
    if (e.data.headline === 'download') {
      var link = document.createElement('A');
      link.href = URL.createObjectURL(e.data.file);
      link.setAttribute('download', e.data.file.name || 'file.dat');
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
