const http = require('http');

const hostname = '0.0.0.0';
const port = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  res.end(`
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Appp5</title>
        <style>
          body {
            margin: 0;
            font-family: Arial, sans-serif;
            background: #f3f4f6;
            color: #111827;
            display: grid;
            place-items: center;
            min-height: 100vh;
          }
          .card {
            background: white;
            border-radius: 12px;
            padding: 2rem 2.5rem;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.08);
            text-align: center;
          }
          h1 {
            margin: 0 0 0.5rem;
            font-size: 2rem;
          }
          p {
            margin: 0;
            color: #4b5563;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>Welcome to Appp5</h1>
          <p>This project is ready for ChatGPT editing and further development.</p>
        </div>
      </body>
    </html>
  `);
});

server.listen(port, hostname, () => {
  console.log(`Appp5 is running at http://localhost:${port}`);
});
