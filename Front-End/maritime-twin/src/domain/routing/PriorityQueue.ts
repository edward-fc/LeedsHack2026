export class PriorityQueue {
    elements: { element: string, priority: number }[];

    constructor() {
        this.elements = [];
    }

    enqueue(element: string, priority: number) {
        this.elements.push({ element, priority });
        this.elements.sort((a, b) => a.priority - b.priority); // Simple sort
    }

    dequeue() {
        return this.elements.shift()!;
    }

    isEmpty() {
        return this.elements.length === 0;
    }
}
