
importScripts('volumizer.js');

self.addEventListener('volumizer-task-unclaimed', function(e) {
  var task = e.detail;
  switch (task.operation) {
    case 'prime-source':
      console.log('claiming task ' + task.id + ' (' + task.operation + ')');
      console.log(task);
      e.preventDefault();
      break;
  }
});

self.onmessage = function onmessage(e) {
  var message = e.data;
  volumizer.tryClaimTask();
};
