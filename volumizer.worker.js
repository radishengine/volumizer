
importScripts('volumizer.js');

var handlers = {
  'prime-source': function(task) {
    return volumizer.getSource(task.source).then(function(source) {
      console.log(source.url);
    });
  },
};

self.addEventListener('volumizer-task-unclaimed', function(e) {
  var task = e.detail;
  if (!(task.operation in handlers)) return;
  e.preventDefault();
  console.log('claiming task:', task);
  var handler = handlers[task.operation];
  Promise.resolve(task).then(handler).then(
    function() {
      return volumizer.update('tasks', task.id, {completedAt:new Date});
    },
    function(reason) {
      return volumizer.update('tasks', task.id, {worker:-2, failedAt:new Date, error:reason+''})
      .then(Promise.reject(reason));
    });
});

self.onmessage = function onmessage(e) {
  var message = e.data;
  volumizer.tryClaimTask();
};
