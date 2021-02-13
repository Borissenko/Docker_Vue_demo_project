const express = require("express")
const mongoose = require("mongoose")
const axios = require("axios")
const session = require('express-session')
const bodyParser = require('body-parser')
const multer = require('multer')
const methodOverride = require('method-override');
const GridFsStorage = require('multer-gridfs-storage');
const crypto = require('crypto');
const path = require('path');

const {ROOT_PATH, port, MONGO_URL, authApiUrl, mode} = require("./configuration")
const {connectDb} = require("./mongooseHelpers/db")
const {delOneDiskFile, delOneGridFile,
  getOneDiskFile, getOneGridFile,
  getAllDiskFilesName, getAllGridFiles,
  getOneImgFromDiskStorageForPicture, getOneImgFromGridStorageForPicture,
  findAllOnTheShelf,
  getSession} = require("./mongooseHelpers/controllers/shop")
const {laptops} = require('./mongooseHelpers/models/shelves')
const {initialLaptopData} = require('../initialData/laptopData')


const app = express();

app.use(bodyParser.json())
app.use(methodOverride('_method'));  //что бы <form> могла поддерживать PUT и DELETE тоже, а не только POST и GET. Для меня не актуально.



//session
//это отдельная специализированный раздел в mongoDb для api-сервиса - заточенный для хранения сессий.
const MongoSessionStore = require('connect-mongo')(session)

const sessionConnection = mongoose.createConnection(MONGO_URL, {useNewUrlParser: true});
app.use(session({
  // name: 'name_of_the_session_ID_cookie',   //имя сессии, ВМЕСТО "connect.sid"
  cookie: {
    httpOnly: false,  //на клиенте эта кука читаться не будет
    maxAge: 1000 * 60
  },
  secret: 'kola',
  resave: false,
  saveUninitialized: false,
  store: new MongoSessionStore({mongooseConnection: sessionConnection})
}))

app.get("/getsession", getSession)


//текстовые роуты для MongoDb.
//Должны быть прописаны НИЖЕ, чем заявление сессии, т.к. мы сессию генерируем в ходе "/mongoCollection" запроса.

app.get("/shop/:shelf", findAllOnTheShelf)



//Загружаем файлы в gridStorage ИЛИ в diskStorage.
//В обоих случаях мы это делаем через multer.
//Необходимо переключать вид используемого хранилища в "let upload = multer({storage: ...})"
// multer
//a) Декларируем хранилище GridFsStorage.
const gridStorage = new GridFsStorage({
  url: MONGO_URL,               //url = "mongodb://api_db:27017/api"
  file: (req, file) => {        //генерация описания сохраняемого файла, в т.ч. его обновленное имя.
    return new Promise(
      (resolve, reject) => {
        const fileInfo = {
          filename: file.originalname,
          // bucketName: 'uploads'   //важно будет знать для удаления файлов, если заявляем gfs.collection('uploads')
        };
        resolve(fileInfo)
      }
    )
  }
});

//b) Декларируем хранилище diskStorage.
var diskStorage = multer.diskStorage({
  destination: ROOT_PATH + 'initialData/imgs/',   //ROOT_PATH = "/usr/src/app/"
  filename: (req, file, cb) => {
    cb(null, file.originalname)
  }
});


//c) заявляем multer, ЛОКАЛЬНО.
let upload = multer({storage: gridStorage})        //<< прописываем используемое хранилище: gridStorage or diskStorage.


//d) роут для upload file to db.
// Мультер сразу через upload сохраняет файл в прописанное в upload'e хранилище.
app.post('/upload_file', upload.single('file'), (req, res) => {
  res.send(`uploadFile ==> ${req.file.originalname}`);
});




//Изображение для <img> from gridStorage
app.get("/grigImage/:imgname", getOneImgFromGridStorageForPicture)




//Изображение для <img> from diskStorage
app.get("/imgs/:shelf/:imgName", getOneImgFromDiskStorageForPicture)   //< us it

app.get("/getAllGridFiles", getAllGridFiles)
app.get("/getAllDiskFilesName", getAllDiskFilesName)
app.get("/gridImgs/:name", getOneGridFile)
app.get("/diskImgs/:name", getOneDiskFile)
app.delete("/gridImgs/:name", delOneGridFile)
app.delete("/diskImgs/:name", delOneDiskFile)


//запрос на соседний сервис докера.
app.get("/currentUser/:userName", async (req, res) => {
  let userName = req.params.userName
  
  await axios.get(authApiUrl + "/" + userName)
  .then(responseFromAuth => {
    res.json({
      isCurrentUser: true,
      currentUserFromAuth: responseFromAuth.data
    })
  })
})


//функция по старту сервера.
const startServer = async () => {
  //Загружаем в mongoDb начальные данные
  //a. предварительно очищаем db, если осуществляем dev-перезапуск.
  if (mode === 'dev') {
    await laptops.deleteMany({}).exec()
    console.log('=============== Server stared on a DEV mode, Очищаем db =>')
  }
  
  //b. загружаем
  await laptops.insertMany(initialLaptopData)
  .then(function () {
    console.log("=============== Initial data is inserted")
  })
  .catch(console.log)
  
  app.listen(port, () => {
    console.log(`=============== Started api service on port ${port}`);
    console.log(`=============== Database url is ${MONGO_URL}`);
  });
};


// Запускаем mongoose и после формирования соединения стартуем у сервера прослушивание им своего порта 3001.
connectDb()
.on("error", console.log)
.on("disconnected", connectDb)   //если рассоединились, то запускаем соединение заново
.once("open", startServer);      //когда коннект с bd установлен мы стартуем процесс прослушивания у запущенного сервера.