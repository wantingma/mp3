var Task = require('../models/task');
var User = require('../models/user');

module.exports = function (router) {
    const tasksRoute = router.route('/tasks');

    tasksRoute.get(async function (req, res) {
        try {
            const query = Task.find({});

            if (req.query.where) {
                try {
                    query.where(JSON.parse(req.query.where));
                } catch (e) {
                    return res.status(400).json({ message: 'Invalid where parameter', data: {} });
                }
            }

            if (req.query.sort) {
                try {
                    query.sort(JSON.parse(req.query.sort));
                } catch (e) {
                    return res.status(400).json({ message: 'Invalid sort parameter', data: {} });
                }
            }

            if (req.query.select) {
                try {
                    query.select(JSON.parse(req.query.select));
                } catch (e) {
                    return res.status(400).json({ message: 'Invalid select parameter', data: {} });
                }
            }

            if (req.query.skip) {
                query.skip(parseInt(req.query.skip));
            }

            if (req.query.limit) {
                query.limit(parseInt(req.query.limit));
            } else {
                query.limit(100);
            }

            if (req.query.count === 'true') {
                const count = await query.countDocuments();
                res.status(200).json({ message: 'OK', data: count });
            } else {
                const tasks = await query.exec();
                res.status(200).json({ message: 'OK', data: tasks });
            }
        } catch (err) {
            res.status(500).json({ message: 'Error retrieving tasks', data: {} });
        }
    });

    tasksRoute.post(async function (req, res) {
        try {
            const newTask = new Task(req.body);
            const err = newTask.validateSync();

            if (err) {
                const message = Object.values(err.errors).map(function (e) { return e.message; }).join(', ');
                return res.status(400).json({ message: message, data: {} });
            }

            const savedTask = await newTask.save();
            if (savedTask.assignedUser && !savedTask.completed) {
                const user = await User.findById(savedTask.assignedUser);
                if (user) {
                    user.pendingTasks.push(savedTask._id);
                    await user.save();
                    savedTask.assignedUserName = user.name;
                    await savedTask.save();
                }
            }
            res.status(201).json({ message: 'Task created', data: savedTask });
        } catch (err) {
            if (err.errors) {
                const message = Object.values(err.errors).map(function (e) { return e.message; }).join(', ');
                return res.status(400).json({ message: message, data: {} });
            }
            res.status(500).json({ message: 'Error creating task', data: {} });
        }
    });

    const tasksIdRoute = router.route('/tasks/:id');

    tasksIdRoute.get(async function (req, res) {
        try {
            const taskId = req.params.id;
            const query = Task.findById(taskId);

            if (req.query.select) {
                try {
                    query.select(JSON.parse(req.query.select));
                } catch (e) {
                    return res.status(400).json({ message: 'Invalid select parameter', data: {} });
                }
            }

            const task = await query.exec();
            if (!task) {
                return res.status(404).json({ message: 'Task not found', data: {} });
            }
            res.status(200).json({ message: 'OK', data: task });
        } catch (err) {
            res.status(500).json({ message: 'Error retrieving task', data: {} });
        }
    });

    tasksIdRoute.put(async function (req, res) {
        try {
            const task = await Task.findById(req.params.id);
            if (!task) {
                return res.status(404).json({ message: 'Task not found', data: {} });
            }

            if (task.completed) {
                return res.status(400).json({ message: 'Cannot update a completed task', data: {} });
            }

            if (req.body.assignedUser) {
                const userExists = await User.findById(req.body.assignedUser);
                if (!userExists) {
                    return res.status(400).json({ message: 'Assigned user does not exist', data: {} });
                }
            }

            const oldAssignedUser = task.assignedUser;
            const oldCompleted = task.completed;

            task.name = req.body.name;
            task.description = req.body.description || '';
            task.deadline = req.body.deadline;
            task.completed = req.body.completed || false;
            task.assignedUser = req.body.assignedUser || '';
            task.assignedUserName = req.body.assignedUserName || 'unassigned';

            const updatedTask = await task.save();

            if (oldAssignedUser && oldAssignedUser !== task.assignedUser) {
                await User.findByIdAndUpdate(
                    oldAssignedUser,
                    { $pull: { pendingTasks: req.params.id } }
                );
            }

            if (task.assignedUser && task.assignedUser !== oldAssignedUser) {
                await User.findByIdAndUpdate(
                    task.assignedUser,
                    { $addToSet: { pendingTasks: req.params.id } }
                );
            }

            if (!oldCompleted && task.completed && task.assignedUser) {
                await User.findByIdAndUpdate(
                    task.assignedUser,
                    { $pull: { pendingTasks: req.params.id } }
                );
            }

            res.status(200).json({ message: 'Task updated', data: updatedTask });
        } catch (err) {
            if (err.errors) {
                const message = Object.values(err.errors).map(function (e) { return e.message; }).join(', ');
                return res.status(400).json({ message: message, data: {} });
            }
            res.status(500).json({ message: 'Error updating task', data: {} });
        }
    });

    tasksIdRoute.delete(async function (req, res) {
        try {
            const task = await Task.findById(req.params.id);
            if (!task) {
                return res.status(404).json({ message: 'Task not found', data: {} });
            }

            await Task.deleteOne({ _id: req.params.id });

            if (task.assignedUser) {
                await User.findByIdAndUpdate(
                    task.assignedUser,
                    { $pull: { pendingTasks: req.params.id } }
                );
            }

            res.status(204).send();
        } catch (err) {
            res.status(500).json({ message: 'Error deleting task', data: {} });
        }
    });

    return router;
};
