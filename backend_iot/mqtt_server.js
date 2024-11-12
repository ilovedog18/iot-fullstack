const express = require('express');
const cors = require('cors');
const mqtt = require('mqtt');
const WebSocket = require('ws');
const Connection = require('./database'); // Import module kết nối cơ sở dữ liệu của bạn

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// Tạo WebSocket server để truyền dữ liệu thời gian thực tới Frontend
const wss = new WebSocket.Server({ port: 8080 });

// Dữ liệu cảm biến lưu tạm
let sensorData = {
  temperature: null,
  humidity: null,
  light_intensity: null,
  wind_speed: null, // Thêm giá trị wind_speed
  lights: {
    light1: false,
    light2: false,
    light3: false,
  },
};

// API để lấy dữ liệu cảm biến hiện tại
app.get('/api/data', (req, res) => {
  res.send(sensorData);
});

// API bật/tắt đèn từ frontend gửi yêu cầu đến
app.post('/api/lights/:lightId', (req, res) => {
  const { lightId } = req.params;
  const { state } = req.body;

  if (sensorData.lights.hasOwnProperty(lightId)) {
    // Gửi lệnh qua MQTT để điều khiển đèn
    const lightCommand = `${lightId === 'light1' ? 'den 1' : lightId === 'light2' ? 'den 2' : 'den 3'} ${state === 'ON' ? 'bat' : 'tat'}`;
    client.publish('inTopic', lightCommand);

    // Lưu lịch sử bật/tắt đèn vào cơ sở dữ liệu
    const actionState = state === 'ON';
    const query = 'INSERT INTO iot.actionhistory (device, action, date_action) VALUES (?, ?, NOW())';
    Connection.query(query, [lightId, actionState], (err) => {
      if (err) {
        console.error('Error inserting action history into database:', err);
        return res.status(500).json({ error: 'Error inserting data into database' });
      }

      // Trả lời yêu cầu từ frontend
      res.json({ message: `Request to turn ${lightId} ${state} has been sent to the hardware.` });
    });
  } else {
    res.status(400).json({ error: 'Invalid light ID' });
  }
});

// API lấy lịch sử bật/tắt đèn từ cơ sở dữ liệu
app.get('/api/lights/history', (req, res) => {
  let { page = 0, limit = 10, search = '', sort = 'id', order = 'DESC', date = '', device = '', action = '' } = req.query;

  const allowedSortFields = ['id', 'device', 'action', 'date_action'];
  const allowedOrderValues = ['ASC', 'DESC'];

  if (!allowedSortFields.includes(sort)) sort = 'id';
  if (!allowedOrderValues.includes(order.toUpperCase())) order = 'DESC';

  const offset = page * parseInt(limit);
  const searchValue = `%${search}%`;
  const dateFilter = date ? ` AND date_action LIKE '%${date}%'` : '';
  const deviceFilter = device ? ` AND device LIKE '%${device}%'` : '';
  const actionFilter = action ? ` AND action LIKE '%${action}%'` : '';

  const queryData = `
    SELECT * FROM iot.actionhistory
    WHERE (device LIKE ? OR action LIKE ? OR date_action LIKE ?)
    ${dateFilter}
    ${deviceFilter}
    ${actionFilter}
    ORDER BY ${sort} ${order}
    LIMIT ? OFFSET ?`;

  const queryCount = `
    SELECT COUNT(*) AS totalCount FROM iot.actionhistory
    WHERE (device LIKE ? OR action LIKE ? OR date_action LIKE ?)
    ${dateFilter}
    ${deviceFilter}
    ${actionFilter}`;

  Connection.query(queryCount, [searchValue, searchValue, searchValue], (err, countResults) => {
    if (err) {
      console.error('Error fetching data count from database:', err);
      return res.status(500).json({ error: 'Error fetching data count' });
    }

    const totalCount = countResults[0].totalCount;

    Connection.query(queryData, [searchValue, searchValue, searchValue, parseInt(limit), offset], (err, dataResults) => {
      if (err) {
        console.error('Error fetching data from database:', err);
        return res.status(500).json({ error: 'Error fetching data' });
      }

      res.json({
        totalCount,
        data: dataResults || [],
      });
    });
  });
});

// API lấy dữ liệu cảm biến từ cơ sở dữ liệu
app.get('/api/sensors', (req, res) => {
  let { page = 0, limit = 10, search = '', sort = 'ID', order = 'DESC', date = '', temperature = '' } = req.query;

  const allowedSortFields = ['ID', 'Temperature', 'Humidity', 'Light', 'Date_iot'];
  const allowedOrderValues = ['ASC', 'DESC'];

  if (!allowedSortFields.includes(sort)) sort = 'ID';
  if (!allowedOrderValues.includes(order.toUpperCase())) order = 'DESC';

  const offset = page * parseInt(limit);
  const searchValue = `%${search}%`;
  const dateFilter = date ? ` AND Date_iot LIKE '%${date}%'` : '';
  const temperatureFilter = temperature ? ` AND Temperature LIKE '%${temperature}%'` : '';

  const queryData = `
    SELECT * FROM iot.sensors
    WHERE
      (Temperature LIKE ? OR Humidity LIKE ? OR Light LIKE ? OR Date_iot LIKE ?)
      ${dateFilter}
      ${temperatureFilter}
    ORDER BY ${sort} ${order}
    LIMIT ? OFFSET ?`;

  const queryCount = `
    SELECT COUNT(*) as totalCount FROM iot.sensors
    WHERE
      (Temperature LIKE ? OR Humidity LIKE ? OR Light LIKE ? OR Date_iot LIKE ?)
      ${dateFilter}
      ${temperatureFilter}`;

  Connection.query(queryCount, [searchValue, searchValue, searchValue, searchValue], (err, countResults) => {
    if (err) {
      console.error('Error fetching data count from database:', err);
      return res.status(500).json({ error: 'Error fetching data count' });
    }

    const totalCount = countResults[0].totalCount;

    Connection.query(queryData, [searchValue, searchValue, searchValue, searchValue, parseInt(limit), offset], (err, dataResults) => {
      if (err) {
        console.error('Error fetching data from database:', err);
        return res.status(500).json({ error: 'Error fetching data' });
      }

      res.json({
        totalCount: totalCount,
        data: dataResults || [],
      });
    });
  });
});

// API lấy dữ liệu tốc độ gió từ cơ sở dữ liệu
app.get('/api/wind_speed', (req, res) => {
  let { page = 0, limit = 10, sort = 'ID', order = 'DESC' } = req.query;

  const allowedSortFields = ['ID', 'WindSpeed', 'Date_wind'];
  const allowedOrderValues = ['ASC', 'DESC'];

  if (!allowedSortFields.includes(sort)) sort = 'ID';
  if (!allowedOrderValues.includes(order.toUpperCase())) order = 'DESC';

  const offset = page * parseInt(limit);

  const queryData = `
    SELECT * FROM iot.wind_speeds
    ORDER BY ${sort} ${order}
    LIMIT ? OFFSET ?`;

  const queryCount = `
    SELECT COUNT(*) as totalCount FROM iot.wind_speeds`;

  Connection.query(queryCount, (err, countResults) => {
    if (err) {
      console.error('Error fetching wind speed count from database:', err);
      return res.status(500).json({ error: 'Error fetching data count' });
    }

    const totalCount = countResults[0].totalCount;

    Connection.query(queryData, [parseInt(limit), offset], (err, dataResults) => {
      if (err) {
        console.error('Error fetching wind speed data from database:', err);
        return res.status(500).json({ error: 'Error fetching data' });
      }

      res.json({
        totalCount: totalCount,
        data: dataResults || [],
      });
    });
  });
});

// Kết nối với MQTT broker
const mqttHost = 'mqtt://172.20.10.3:1893';
const mqttOptions = {
  username: 'hoang',
  password: 'b21dccn393'
};
const client = mqtt.connect(mqttHost, mqttOptions);

client.on('connect', () => {
  console.log('Connected to MQTT broker');
  client.subscribe('temperature');
  client.subscribe('humidity');
  client.subscribe('light_intensity');
  client.subscribe('light_status');
  client.subscribe('wind_speed'); // Đăng ký thêm topic 'wind_speed'
});

// Nhận dữ liệu từ các chủ đề MQTT và cập nhật trạng thái
client.on('message', (topic, message) => {
  console.log(`Received on ${topic}: ${message.toString()}`);

  switch (topic) {
    case 'temperature':
      sensorData.temperature = parseFloat(message.toString());
      break;
    case 'humidity':
      sensorData.humidity = parseFloat(message.toString());
      break;
    case 'light_intensity':
      sensorData.light_intensity = parseFloat(message.toString());
      break;
    case 'light_status':
      const [device, status] = message.toString().split(':');
      if (sensorData.lights.hasOwnProperty(device)) {
        sensorData.lights[device] = status === 'ON';
      }
      break;
    case 'wind_speed':  // Thêm xử lý dữ liệu tốc độ gió
      const windSpeed = parseFloat(message.toString());
      sensorData.wind_speed = windSpeed;

      // Lưu giá trị tốc độ gió vào bảng wind_speeds
      const insertWindSpeedQuery = `
        INSERT INTO iot.wind_speeds (WindSpeed, Date_wind) 
        VALUES (?, NOW())
      `;
      Connection.query(insertWindSpeedQuery, [windSpeed], (err, result) => {
        if (err) {
          console.error('Error inserting wind speed into database:', err);
        } else {
          console.log('Wind speed data inserted into database.');
        }
      });

      // Gửi dữ liệu `wind_speed` qua WebSocket tới các client
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ windSpeed: windSpeed }));
        }
      });
      break;

    default:
      console.warn(`Unknown topic: ${topic}`);
  }
});

// Sự kiện kết nối WebSocket
wss.on('connection', (ws) => {
  console.log('Client connected to WebSocket');
  ws.on('close', () => console.log('Client disconnected from WebSocket'));
});

client.on('error', (error) => {
  console.error('MQTT Connection Error:', error);
});

// Khởi động server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
