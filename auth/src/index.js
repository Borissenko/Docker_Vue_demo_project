const express = require("express")
const mongoose = require("mongoose")
const session = require('express-session')
const bodyParser = require('body-parser')
const cookieParser = require('cookie-parser')
const {port, MONGO_URL, mode} = require("./configuration")

const {connectDb} = require("./mongooseHelpers/db")
const {authModel} = require("./mongooseHelpers/models/auth")
const {initialAccounts} = require("../initialData/initialAccounts")

const {putProductToBasket, deleteProductAtBasket, getBasket, retrieveSessionBasket} = require("./mongooseHelpers/controllers/anyBaskets")
const {identification, touchAccount} = require("./mongooseHelpers/controllers/auth")
const {AuthService} = require('./service/auth.service')

const app = express()
app.use(bodyParser.json())    //(!)-Обязателен для всех запросов, которые имеют pl(для POST-запросов).
app.use(cookieParser('demoProject'))


//session
//это отдельная специализированный раздел в mongoDb для api-сервиса - заточенный для хранения сессий.
const MongoSession = require('connect-mongo')    //посредник между блоком session и блоком mongoose   //npm install connect-mongo@3(!), НЕ версия 4(!).
const MongoSessionStore = MongoSession(session)
const sessionConnection = mongoose.createConnection(MONGO_URL, {useNewUrlParser: true});

app.use(session({
  // name: 'name_of_the_session_ID_cookie',   //имя сессии, ВМЕСТО "connect.sid"
  cookie: {
    httpOnly: false,  //на клиенте эта кука читаться не будет
    maxAge: 3600000
  },
  secret: 'Nick',       // <<<<<<<<<<<<<<< надо ПЕРЕНЕСТИ В ПЕРЕМЕННЫЕ ДОКЕРА(!)
  resave: false,
  saveUninitialized: false,
  store: new MongoSessionStore({mongooseConnection: sessionConnection, ttl: 14 * 24 * 60 * 60})
}))


//проверка accessToken'a
app.use(async (req, res, next) => {
  let accessToken = req.headers.accesstoken
  let accessTokenBody = ''             //что бы узнать значение логина, { login: '(999) 999-99-99', exp: 1622543413881 }
  let isAccessTokenMatched = false    //accessToken идентичный И недеформированный. Просроченность здесь не обсуждается.
  let isAccessTokenAlive = false      //accessToken действенный, НЕпросроченный - true/false.
  let refreshToken = AuthService.separateCookie(req.headers.cookie, 'refreshToken')
  
  if (accessToken) {
    //1. ПРОВЕРКИ access-токена:
    //Проверяем ДЕФОРМИРОВАННОСТЬ и ПРОСРОЧЕННОСТЬ токена:
    // НЕдеформированный и НЕпросроченный-{ login: '(999) 999-99-99', exp: 1622543413881 },
    // деформированный-{ login: '0', exp: body.exp },
    // просроченный-{ login: body.login, exp: 0 }.
    accessTokenBody = AuthService.checkAccessTokenForSolidAndRepresentTokenBody(accessToken)      //return тело токена, { login: '(999) 999-99-99', exp: 1622543413881 }.
    isAccessTokenAlive = Boolean(accessTokenBody.exp)
    
    
    //Если accessToken - недеформированный, то дополнительно
    //проверяем ИДЕНТИЧНОСТЬ accessToken'a с серверным эталоном.
    if (accessTokenBody.login !== '0') {
      await AuthService.checkAccessTokenForMatch(accessToken, accessTokenBody)   //login для поиска аккаунта берем из accessTokenBody.
        .then(accessTokenValidation => {
          isAccessTokenMatched = accessTokenValidation
        })
    }
    else {
    //2с. Если accessToken - деформированный, СОВЕРШАЕМ LOGOUT
      return res.status(403).send({message: 'you need to get authorisation again'})
    }
    
    //2. ДЕЙСТВИЯ на основании проверок:
    //2а. Если accessToken недеформированный, непросроченный и идентичный - код идет дальше по общему сценарию.
    //req.is_authorization будет равен true.
    
    //2b. Если accessToken недеформированный и идентичный, но ПРОСРОЧЕННЫЙ, то:
    //2b-1. Поступил уже собственно запрос для ВОССТАНОВЛЕНИЯ accessToken'a, '/auth/authentication'.
    //Запрос пропускаем.
    //req.is_authorization здесь будет равен (true && false)=> false.
    //В pl запроса будет {login: '', password: ''}.
    
    //2b-2. Поступил ПЕРВИЧНЫЙ какой-либо запрос на auth, но не на '/auth/authentication', - отправляем клиенту ошибку 401,
    //далее axios-интерсептор клиента получает ошибку и посылает запрос на восстановление accessToken'а (pl запроса будет - {login: '', password: ''}),
    //Как только клиент получит восстановленный accessToken, то axios-интерсептор повторяет неудавшийся запрос.
    if (isAccessTokenMatched && !isAccessTokenAlive && !req.url.includes('authentication')) {
      res.status(401)
      return
    }
  }

  //в состоянии login + находимся в '/basket' (refreshToken - есть) и перезагружаем сайт (т.е. url у запроса будет '/basket', причем accessToken слетает) - будем перебрасываться на '/a11n'.
  if(!accessToken && req.headers.referer.includes('/basket') && refreshToken) {
    return res.status(403).send({message: `you WERE logged in <br>and <br> in this way <br> you need to get authorisation again.`})
  }


  //Сюда проходят:
  //- запросы вне авторизации,
  //- запросы с авторизацией, accessToken - НЕдеформированный, идентичный и НЕпросроченный,
  //- запросы с авторизацией, accessToken - НЕдеформированный, идентичный, но ПРОСРОЧЕННЫЙ, причем пропускаем запросы только на url('/auth/authentication').
  //В переменные запроса прописываем authorizedLogin  => далее используем сессионную ИЛИ аккаунтную корзину.
  if(isAccessTokenMatched && isAccessTokenAlive)
    req.authorizedLogin = accessTokenBody.login
  else
    req.authorizedLogin = ''

  next()
})


//basket
app.get("/basket", getBasket)
app.put("/basket", putProductToBasket)
app.delete("/basket", deleteProductAtBasket)


//a12n (Authentication).
//Префикс роутера "/api" обрезан в nginx'e.
app.get("/identification/:login", identification)     //проверка наличия логина
app.post("/authentication", touchAccount)     //for LOGIN, LOGOUT, create_account & for "восстановление accessToken'a через refreshToken" concurrently.


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
