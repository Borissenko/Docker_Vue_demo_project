const express = require("express");
const assert = require('assert');
const bodyParser = require('body-parser')
const cookieParser  = require ('cookie-parser')
const {port, MONGO_URL, mode} = require("./configuration");

const {connectDb} = require("./mongooseHelpers/db");
const {authModel} = require("./mongooseHelpers/models/auth")
const {initialAccounts} = require("../initialData/initialAccounts")
const {identification, touchAccount} = require("./mongooseHelpers/controllers/auth")

const app = express();
app.use(bodyParser.json())    //(!) Обязателен для всех запросов, которые имеют pl.
app.use(cookieParser('demoProject'))


//a12n (Authentication).
//Префикс роутера "/api" обрезан в nginx'e.
app.get("/identification/:login", identification)     //проверка наличия логина
app.post("/authentication", touchAccount)     //for LOGIN, LOGOUT & create_account concurrently


//Запросы между сервисами, минуя nginx. (http://auth:3002/api/user_kola)
//Запрос НЕ через nginx, поэтому НЕ ЗАБЫВАЕМ писать префикс "/api"(!) в ... .
//Префикс "/api" добавился из authApiUrl (http://auth:3002/api), и далее основное доменное имя http://auth:3002/ (и только оно) отбрасывается EXPRESSOM'ом.
//Поэтому в имени ПРИНИМАЮЩЕГО роутера должен фигурировать "/api"(!). Это МЕЖСЕРВИСНЫЙ запрос МИНУЯ NGNIX(!)(который может переписать по нашему указанию адрес, отбросив "/api").
// app.get("/api/:user", example)


const startServer = async () => {
  //Загружаем в mongoDb начальные данные - тестовый аккаунт.
  //a. предварительно очищаем db, если осуществляем dev-перезапуск.
  if (mode === 'dev') {
    await authModel.deleteMany({}).exec()
    console.log('=============== AUTH stared on a DEV mode, Очищаем AUTH_db =>')
  }
  
  //b. загружаем
  await authModel.insertMany(initialAccounts)
  .then(function () {
    console.log("=============== initialAccounts is inserted")
  })
  .catch(console.log)
  
  
  app.listen(port, () => {
    console.log(`Started AUTH-service on port ${port}`);
    console.log(`AUTH_Database url ${MONGO_URL}`);
  });
};

connectDb()
.on("error", console.log)
.on("disconnected", connectDb)
.once("open", startServer);
