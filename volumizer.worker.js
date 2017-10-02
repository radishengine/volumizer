
importScripts('volumizer.js');

self.addEventListener('volumizer-task-unclaimed', function(e) {
  var task = e.detail;
  console.log('claiming task ' + task.id);
  e.preventDefault();
});

self.onmessage = function onmessage(e) {
  var message = e.data;
  volumizer.tryClaimTask();
};
