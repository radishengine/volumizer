
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
    var meg = new Uint8Array(1024 * 1024);
    var blob = new Blob([
      meg, meg, meg, meg, meg,
      meg, meg, meg, meg, meg]);
    function onChunk(chunk) {
      console.log(chunk.length);
    }
    return data.streamBlob(onChunk, blob);
  },
};

onmessage.promiseChain = Promise.resolve();
