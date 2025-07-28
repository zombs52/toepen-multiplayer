// Event-driven architecture base class
export class EventManager {
    constructor() {
        this.events = new Map();
    }

    // Subscribe to an event
    on(eventType, callback) {
        if (!this.events.has(eventType)) {
            this.events.set(eventType, []);
        }
        this.events.get(eventType).push(callback);
        
        // Return unsubscribe function
        return () => this.off(eventType, callback);
    }

    // Unsubscribe from an event
    off(eventType, callback) {
        if (!this.events.has(eventType)) {
            return false;
        }
        
        const callbacks = this.events.get(eventType);
        const index = callbacks.indexOf(callback);
        
        if (index !== -1) {
            callbacks.splice(index, 1);
            return true;
        }
        
        return false;
    }

    // Emit an event
    emit(eventType, data = {}) {
        if (!this.events.has(eventType)) {
            return;
        }
        
        const callbacks = this.events.get(eventType);
        callbacks.forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                console.error(`Error in event handler for ${eventType}:`, error);
            }
        });
    }

    // Subscribe to an event only once
    once(eventType, callback) {
        const unsubscribe = this.on(eventType, (data) => {
            unsubscribe();
            callback(data);
        });
        return unsubscribe;
    }

    // Remove all event listeners
    removeAllListeners(eventType = null) {
        if (eventType) {
            this.events.delete(eventType);
        } else {
            this.events.clear();
        }
    }

    // Get list of event types with listeners
    getEventTypes() {
        return Array.from(this.events.keys());
    }

    // Get number of listeners for an event type
    getListenerCount(eventType) {
        return this.events.has(eventType) ? this.events.get(eventType).length : 0;
    }
}