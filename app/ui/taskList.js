import { EVENTS } from '../shared/events.js';

function renderRows(tableBodyElement, tasks) {
    const rows = tasks
        .map((task) => `<tr><td>${task.title}</td><td>${task.priority}</td><td>${task.owner}</td><td>${task.status}</td></tr>`)
        .join('');

    tableBodyElement.innerHTML = rows;
}

export function initTaskList({ tableBodyElement, taskService, eventBus }) {
    if (!tableBodyElement) {
        return;
    }

    const refresh = () => {
        const tasks = taskService.listTasks();
        renderRows(tableBodyElement, tasks);
    };

    eventBus.subscribe(EVENTS.TASK_CREATED, refresh);
    refresh();
}

