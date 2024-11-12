const mysql = require('mysql2');

const Connection = mysql.createPool({
    host: 'localhost',        // Đặt trong dấu nháy
    port: 3306,
    user: 'root',             // Đặt trong dấu nháy
    password: 'hoang2001',    // Đặt trong dấu nháy
    database: 'iot',          // Đặt trong dấu nháy
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

module.exports = Connection;
