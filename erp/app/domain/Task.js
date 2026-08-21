export class Task {
    constructor({ id, title, priority, owner, status = 'OPEN' }) {
        this.id = id;
        this.title = title;
        this.priority = priority;
        this.owner = owner;
        this.status = status;
    }
}

