
importScripts('volumizer.js');

self.onmessage = function onmessage(e) {
  var message = e.data;
  switch (message.headline) {
    case 'init':
      self.name = message.name;
      console.log(self.name);
      break;
  }
};
