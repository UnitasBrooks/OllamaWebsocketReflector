import { WebSocket } from 'ws';

async function postData(url: string, data: object) {
    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const result = await response.json();
        console.log("Response Data:", result);
        return result;
    } catch (error) {
        console.error("Error:", error);
    }
}


const socket = new WebSocket('wss://jtjfi3hr04.execute-api.us-west-2.amazonaws.com/dev');

socket.onopen = () => {
    console.log('Connected to WebSocket server');
    socket.send('AIConnect');
};

socket.onmessage = (event) => {
    console.log(event.data)
    postData(
        "http://localhost:11434/api/generate",
        {
            "model": "gemma3:1b",
            "prompt": event.data,
            "stream": false
        }
    ).then(r => socket.send(r['response']));
};

socket.onerror = (error) => {
    console.error(`WebSocket error: ${error}`);
};

socket.onclose = () => {
    console.log('WebSocket connection closed');
};

