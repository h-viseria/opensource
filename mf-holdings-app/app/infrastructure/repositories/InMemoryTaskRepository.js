export class InMemoryTaskRepository {
    constructor() {
        this.tasks = [];
        this.lastId = 0;
    }

    nextId() {
        this.lastId += 1;
        return this.lastId;
    }

    save(task) {
        this.tasks.push(task);
    }

    findAll() {
        return [...this.tasks];
    }
}

