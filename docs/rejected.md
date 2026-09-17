# Rejected

Ideas we decided against, each with its reason. Do not propose one again unless its reason no longer holds.
Planned work belongs in tasko.

- **Each space numbers its tasks from #1.** Today one counter serves every space, so #42 is one task wherever it
  is, and the numbers grow large. The idea was a counter per space, for small numbers. Rejected: a move would give
  the task a new number and break every link and mention of the old one, and `#5` would mean a different task in
  each space. Small numbers buy nothing: a family says "the dentist task", not "#5 in parents".
- **The app picks who gets a notification.** An earlier rule notified the assignee and the author on some events.
  It both spammed, the author got every change of their own task, and missed the people who cared but held neither
  role. Now the actor ticks the recipients on each write, and the app adds nobody.
- **Keep a record of who was notified.** Today an unread notification is deleted once the reader opens the task,
  so the app never knows who was told. The idea was a permanent record, so the task's activity could show
  "notified alice", or a read flag, so the sender could see it was seen. Rejected: nobody asked for it, and a
  notification is a message that matters while unread; nothing of it needs to stay after.
- **The author deletes their own untouched task.** Today only an admin deletes a task, by number, on the admin
  page; anyone else closes it. The idea was a "Delete" on the task page for the author while nobody else had acted
  on the task. Rejected: a misclick could take a big task the author had led alone, with every comment, and any
  rule that guards against it, such as "only with no event after the creation", makes the feature too narrow to
  matter. A task that bothers someone is closed, or an admin deletes it.
- **A global label rename stops at a space's own label of the new name.** A global label renamed to a name a
  space has as its own label: the tasks of that space that carried the global one take the new name, which there
  means the space's own label. The idea was to refuse such a rename, or to leave those tasks the old name in grey.
  Rejected: a space that uses a global label accepts its renames, and the merge is the global decision applied
  there. The rename still skips a space with its own label of the old name: there the name means that label.
- **A label rename writes an event on every task renamed.** A rename rewrites the name on the tasks but writes no
  event and keeps their `updatedAt`, so the rows do not rebuild from the events alone. The idea was one event per
  task, moving its `updatedAt`, to close the gap. Rejected: the lists and My tasks sort by last update, so renaming a
  busy global label would push every task that carries it to the top of every space; the Activity tab, the newest
  300 events, would fill with one admin's click; and one action would write thousands of events. Nothing replays
  the events, so the exact rebuild has no consumer. The rename is a change of the label, not of the task.
