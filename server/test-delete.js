const id = '831eb655-4de1-4283-9cae-78bbc0c7cfe2'; // one of the IDs I found
fetch(`http://localhost:5005/api/interviews/${id}`, {
  method: 'DELETE',
  headers: { 'Authorization': 'Bearer asdf' } // using an invalid token just to see the endpoint response, but wait, it will just say Invalid token.
}).then(r => r.text()).then(console.log);
