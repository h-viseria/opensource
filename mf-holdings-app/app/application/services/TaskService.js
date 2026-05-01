import { Task } from '../../domain/Task.js';

export class TaskService {
    constructor(taskRepository) {
        this.taskRepository = taskRepository;
    }

    createTask(input) {
        const title = (input.title || '').trim();
        const owner = (input.owner || '').trim();
        const priority = (input.priority || '').trim();

        if (!title || !owner || !priority) {
            throw new Error('Title, priority, and owner are required.');
        }

        const task = new Task({
            id: this.taskRepository.nextId(),
            title,
            priority,
            owner,
        });

        this.taskRepository.save(task);
        return task;
    }

    listTasks() {
        return this.taskRepository.findAll();
    }
}

