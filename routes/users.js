var User = require('../models/user');
var Task = require('../models/task');

module.exports = function (router) {
    const usersRoute = router.route('/users');

    usersRoute.get(async function (req, res) {
        try {
            const query = User.find({});

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
                    const jsonParsedResult = JSON.parse(req.query.select);
                    query.select(jsonParsedResult);
                    console.log(req.query.select);
                } catch (e) {
                    return res.status(400).json({ message: 'Invalid select parameter', data: {} });
                }
            }

            if (req.query.skip) {
                query.skip(parseInt(req.query.skip));
            }

            if (req.query.limit) {
                query.limit(parseInt(req.query.limit));
            }

            if (req.query.count === 'true') {
                const count = await query.countDocuments();
                res.status(200).json({ message: 'OK', data: count });
            } else {
                const users = await query.exec();
                res.status(200).json({ message: 'OK', data: users });
            }
        } catch (err) {
            res.status(500).json({ message: 'Error retrieving users', data: {} });
        }
    });

    usersRoute.post(async function (req, res) {
        try {
            const newUser = new User(req.body);
            const err = newUser.validateSync();

            if (err) {
                const message = Object.values(err.errors).map(function(e) { return e.message; }).join(', ');
                return res.status(400).json({ message: message, data: {} });
            }

            const savedUser = await newUser.save();
            res.status(201).json({ message: 'User created', data: savedUser });
        } catch (err) {
            if (err.code === 11000) {
                return res.status(400).json({ message: 'User with this email already exists', data: {} });
            }
            if (err.errors) {
                const message = Object.values(err.errors).map(function(e) { return e.message; }).join(', ');
                return res.status(400).json({ message: message, data: {} });
            }
            res.status(500).json({ message: 'Error creating user', data: {} });
        }
    });

    const usersIdRoute = router.route('/users/:id');

    usersIdRoute.get(async function (req, res) {
        try {
            const userId = req.params.id;
            const query = User.findById(userId);

            if (req.query.select) {
                try {
                    query.select(JSON.parse(req.query.select));
                } catch (e) {
                    return res.status(400).json({ message: 'Invalid select parameter', data: {} });
                }
            }

            const user = await query.exec();
            if (!user) {
                return res.status(404).json({ message: 'User not found', data: {} });
            }
            res.status(200).json({ message: 'OK', data: user });
        } catch (err) {
            res.status(500).json({ message: `Error retrieving user: ${err}`, data: {} });
        }
    });

    usersIdRoute.put(async function (req, res) {
        try {
            const user = await User.findById(req.params.id);
            if (!user) {
                return res.status(404).json({ message: 'User not found', data: {} });
            }

            const oldPendingTasks = user.pendingTasks || [];
            const newPendingTasks = req.body.pendingTasks || [];

            if (newPendingTasks.length > 0) {
                const existingTasks = await Task.find({ _id: { $in: newPendingTasks } });
                if (existingTasks.length !== newPendingTasks.length) {
                    return res.status(400).json({ message: 'One or more tasks do not exist', data: {} });
                }
            }

            user.name = req.body.name;
            user.email = req.body.email;
            user.pendingTasks = newPendingTasks;

            const updatedUser = await user.save();

            await Task.updateMany(
                { _id: { $in: oldPendingTasks }, _id: { $nin: newPendingTasks } },
                { assignedUser: '', assignedUserName: 'unassigned' }
            );

            await Task.updateMany(
                { _id: { $in: newPendingTasks }, _id: { $nin: oldPendingTasks } },
                { assignedUser: updatedUser._id.toString(), assignedUserName: updatedUser.name }
            );

            res.status(200).json({ message: 'User updated', data: updatedUser });
        } catch (err) {
            if (err.code === 11000) {
                return res.status(400).json({ message: 'User with this email already exists', data: {} });
            }
            if (err.errors) {
                const message = Object.values(err.errors).map(function(e) { return e.message; }).join(', ');
                return res.status(400).json({ message: message, data: {} });
            }
            res.status(500).json({ message: 'Error updating user', data: {} });
        }
    });

    usersIdRoute.delete(async function (req, res) {
        try {
            const user = await User.findById(req.params.id);
            if (!user) {
                return res.status(404).json({ message: 'User not found', data: {} });
            }

            await User.deleteOne({ _id: req.params.id });

            await Task.updateMany(
                { _id: { $in: user.pendingTasks } },
                { assignedUser: '', assignedUserName: 'unassigned' }
            );

            res.status(204).send();
        } catch (err) {
            res.status(500).json({ message: `Error retrieving user: ${err}`, data: {} });
        }
    });

    return router;
};
