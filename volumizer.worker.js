
importScripts(
  'data.js');

self.onmessage = function onmessage(e) {
  onmessage.promiseChain = onmessage.promiseChain.then(function() {
    var message = e.data;
    var handled;
    if (message.headline in onmessage.handlers) {
      handled = onmessage.handlers[message.headline](message);
    }
    else {
      handled = Promise.reject('unrecognized message headline: ' + message.headline);
    }
    return handled.then(
      function(result) {
        postMessage({
          id: message.id,
          headline: 'complete',
          final: true,
          result: result,
        });
      },
      function(reason) {
        postMessage({
          id: message.id,
          headline: 'problem',
          final: true,
          problem: ''+e,
        });
      });
  });
};

onmessage.handlers = {
  'open-blob': function(message) {
    var cc = new data.ChunkCache;
    cc.initBlob(message.blob);
    return cc.getBytes([{start:1024, end:1024+512}]).then(function(bytes) {
      console.log(bytes);
    });
  },
};

onmessage.promiseChain = Promise.resolve();
