
importScripts(
  'data.js');

const handlers = {
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

self.onmessage = function onmessage(e) {
  var message = e.data;
  if (!(message.headline in handlers)) {
    postMessage({
      id: message.id,
      headline: 'problem',
      final: true,
      problem: 'unrecognized message headline: ' + message.headline,
    });
    return;
  }
  var handler = handlers[message.headline];
  return handler(message).then(
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
};
