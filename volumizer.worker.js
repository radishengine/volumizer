
self.onmessage = function onmessage(e) {
  var message = e.data;
  switch (message.headline) {
    case 'open-blob':
      var url = URL.createObjectURL(new Blob([new Uint8Array(1024 * 1024)]));
      fetch(url).then(function(r) {
        var reader = r.body.getReader();
        function nextChunk(chunk) {
          if (chunk.done) {
            URL.revokeObjectURL(url);
            postMessage({
              id: message.id,
              headline: 'close',
              final: true,
              result: null,
            });
            return;
          }
          chunk = chunk.value;
          console.log(chunk.length);
          return reader.read().then(nextChunk);
        }
        return reader.read().then(nextChunk);
      });
      break;
    default:
      postMessage({
        id: message.id,
        headline: 'problem',
        final: true,
        problem: 'unrecognized message headline: ' + message.headline,
      });
      break;
  }
};
