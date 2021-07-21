const cookieParser = require('cookie-parser')
const axios = require('axios')
const assert = require('assert')
const {authModel} = require('../models/auth')
const {AuthService} = require('../../service/auth.service')
const {apiUrl} = require('../../configuration')

const {retrieveSessionBasket} = require('./anyBaskets')

//controllers for authorisation

module.exports.identification = async(req, res) => {
  let login = req.params.login
  
  await authModel.findOne({login: login}, function(err, login) {
    assert.equal(err, null);
    return login
  })
    .then(login => {
      if(login != null)
        res.send({isLogin: true})
      else
        res.send({isLogin: false})
    })
    .catch(console.log)
}


//for LOGIN, LOGOUT(when "password: false", а req.is_authorization = true) & create_account concurrently AND
//for "восстановление accessToken'a через refreshToken" (в pl запроса будет {login: '', password: ''}).
module.exports.touchAccount = async(req, res) => {
  let login = req.body.login   // при LOGIN, LOGOUT & create_account - имеет значение, при "восстановлении accessToken'a" - login = ''.
  let password = req.body.password
  let filter
  let sessionID = req.sessionID
  let currentRefreshToken = ''

  
  //a. for LOGIN, LOGOUT({login: '999-99-99', password: ''}) & create_account. NOT for refreshing tokens.
  // Аккаунт ищем по значению login & password.
  // req.is_authorization задается в express/index.js/app.use().
  if(login) {
    filter = {login}         //filter = {login: login}
  } else {
    //b. for refreshing token.
    // Аккаунт ищем по значению refreshToken'a.
    currentRefreshToken = AuthService.separateCookie(req.headers.cookie, 'refreshToken')
    
    if(currentRefreshToken)
      filter = {refreshToken: currentRefreshToken}  //фильтром для отбора аккаунта будет не логин, а refreshToken
    else
      return res.status(403).send({message: 'refreshToken is wrong'})
  }
  
  //обращаемся к аккаунту
  await authModel.findOne(filter, function(err, account) {
    assert.equal(err, null);
    return account
  })
    .then(async account => {
      console.log('account, который нашли в bd, =======', account)
      //если восстановливаем accessToken, то проверяем непросроченность refreshToken'a и его идентичность эталонному
      if(!login && currentRefreshToken) {
        let currentRefreshTokenValid = AuthService.checkRefreshToken(account.refreshToken, currentRefreshToken)
        
        if(!currentRefreshTokenValid) {  //current refreshToken невалидный
          return res.status(403).send({message: 'refreshToken is wrong'})
        }
      }
      
      let accessToken = (password || currentRefreshToken) ? AuthService.createAccessToken(login) : ''  //присуждаем значение только при login(будет присутствовать паспорт), а при logout - обнуляем их.
      let refreshToken = (password || currentRefreshToken) ? AuthService.createRefreshToken() : ''
      
      //если аккаунта нет(и это - не восстановление токенов), то создаем его, вписав в него токены.
      if((account == null) && login) {
        account = new authModel({
          login,
          password,
          accessToken,
          refreshToken,
          userData: {
            basket: []
          }
        })
      } else {
        //если аккаунт есть, то
        //a) если в запросе password - не указан, т.е. здесь >LOGOUT<.
        if(!password) {
          account.accessToken = ''
          account.refreshToken = ''
        } else if(account.password === password) {
          //b) проверяем идентичность паспорта и далее обновляем аккаунт, вписав в него токены.
          account.accessToken = accessToken
          account.refreshToken = refreshToken
        } else {
          //несовпадение паспорта с эталоном
          res.status(403).send({message: 'password is wrong'})
          return
        }
      }
      
      //добавляем СЕССИОННУЮ КОРЗИНУ в аккаунтную корзину,
      //exactly for LOGIN & create_account (в этом случае будет присутствовать login+password), а так же при восстановлении просроченного токена(login'a нет),
      //не для logout(есть login, но нет password),
      //sessionID добавлено для подстраховки, ибо далее мы забираем сессионную корзину, опираясь на именно sessionID.
      if(((login && password) || !login) && sessionID) {
        await retrieveSessionBasket(sessionID)
          .then(retrievedBasket => {
            account.userData.basket.push(...retrievedBasket.basketPoints)
          })
      }
      
      //сохраняем изменения аккаунта
      await account.save(function(err, account) {
        if(err) throw err;
      })
      
      console.log('ACCOUNT to save ===========', account)
      
      // генерируем refreshToken-куку
      res.cookie('refreshToken', refreshToken, {
        // maxAge: 3600000 * 24,                                          // 3600000ms * 24 = 24 часа
        expires: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),   //формат 2021-03-25T09:53:13.067Z
        httpOnly: true,
        secure: true,
        sameSite: 'Strict',
        // path: '/auth'
      })
      
      //RESPONSE
      //сообщаем accessToken,
      //возвращаем обновленную корзину: сессионная + аккаунтная корзины, а при logout - возвращаем пустой [].
      res.send({
        login,
        accessToken,
        userData: {
          basket: password ? account.userData.basket : []
        }
      })
    })
    .catch(error => {   //ошибка при поиске аккаунта.
      console.log('error_during_finding_an_account = ', error)
      res.status(403).send({message: 'error_during_finding_an_account'})
    })
}

