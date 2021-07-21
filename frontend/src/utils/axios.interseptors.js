import store from '../store'
import router from "@/router";
import axios from "axios"
import AuthUtils from './auth.utils'
//https://qna.habr.com/q/519691

//#A. Предварительная валидация access-токена.
const treatAccessTokenInterceptor = store => async config => {
  let url = config.url
  let accessToken = store.getters.GET_ACCESS_TOKEN      //по-умолчанию равен ''.
  let isAuthAccess                                      //from LocalStorage, стигма о наличии (скрытой и недоступной для клиента) refresh-куки. Для перезагрузки в состоянии совершенного Login'a.
  // await store.dispatch('GET_AUTH_AT_LOCAL_STORAGE', 'authAccess').then(authAccess => isAuthAccess = authAccess)      //actions возвращают return, ОБЕРНУТЫЙ в промис(!). await-обязателен(!).


  //1. отправляем запрос без изменений, не добавляя header с accessToken'ом.
  //a) если запрос - не на "/auth".
  //b) если запрос на "/auth", но к СЕССИОННОЙ карзине, т.е. когда НЕ к "/auth/authentication", а accessToken и isAuthAccess - отсутствуют.
  //с) если обращение к "/auth/authentication"- первичное (когда только отправляем запрос на аутентификацию, create_accaunt), accessToken и isAuthAccess - отсутствуют.
  // //d) если обращаемся к "/auth/authentication" в перезагрузе сайта + когда пользователь уже залогененый - accessToken нет, isAuthAccess - есть.
  
  // // Важно:
  // что бы запрос на восстановление не пошел в интерсепторе по пути, который вновь запускает action по восстановлениею accessToken'a.
  // Когда мы перезагружаем сайт у залогиненного пользователя. accessToken- слетает, но refreshToken продолжает быть.
  // Однако запросить из броузера refreshToken-куку - невозможно.
  // Поэтому факт залогенности мы дополнительно фиксируем в LocalStorage- isAuthAccess (маркер наличия у пользователя refreshToken'a), и
  // при наличии после перезагрузки сайта этого флага - мы запускаем восстановление access-токена.
  
  isAuthAccess = false   //присудил - на время, пока отключен код по восстановлению токенов при перезагрузке сайта в условиях уже осуществленного login'a.
  
  if(
    !url.includes('auth') ||
    (!url.includes('auth/authentication') && !accessToken && !isAuthAccess) ||
    (url.includes('auth/authentication') && !accessToken && !isAuthAccess) ||
    (url.includes('auth/authentication') && !accessToken && isAuthAccess)         //выражение можно упростить, но для наглядности оставляю его в развернутом виде
  ) {
    return config
  }
  
  //2. Добавляем accessToken в хедер.
  // via
  // проверяем accessToken
  //Это случаи, когда:
  //а) обращение к аккаунтной корзине или к accountData - путь НЕ к "/auth/authentication", есть accessToken и isAuthAccess.
  // Когда accessToken НЕ просрочен, то прикрепляем его в хедер запроса.
  // При просроченности accessToken:
  // - запускаем action, который посылает запрос на восстановление токена
  // - по приходу ответа сервера токены перезаписываются на клиенте.
  // - всё это время интерсептор находиться в состоянии await
  // - после завершения await action интерсептор повторяет(продолжает) неудавшейся запрос.
  //b) LOGOUT.
  
  let tokenRecoveryPromise = null
  let tokenExp = AuthUtils.pullOutAccessTokenBody(accessToken).exp   //exp берем из дешифрованного тела токена { login: '(999) 999-99-99', exp: 1622532886941 }
  
  isAuthAccess = true   //присудил - на время, пока отключен код по восстановлению токенов при перезагрузке сайта в условиях уже осуществленного login'a.
  
  // запросы по манипуляциям с АККАУНТНОЙ корзиной или с accountData, или если запрашиваетсяlogout.
  if(tokenExp && !config.url.includes('auth/authentication') && accessToken && isAuthAccess ||
    tokenExp && config.url.includes('auth/authentication') && config.data.login && !config.data.password && accessToken && isAuthAccess
  ) {
    //проверяем просроченность access-токена
    if(tokenExp < Date.now()) {    //a) access-токен - просрочен.
      //посылаем запрос для восстановления access-токена с помощью refresh-токена,
      //в результате запроса обновленный accessToken пропишеться в Store.
      tokenRecoveryPromise = store.dispatch('TOUCH_ACCOUNT', {login: '', password: ''})   //for "восстановление accessToken'a через refreshToken"
      await tokenRecoveryPromise
      tokenRecoveryPromise = null
      
      //ПОВТОРНО запрашиваем из Store ВОССТАНОВЛЕННЫЙ accessToken и прикрепляем его к хедеру запроса и далее
      //передаем в пролонгацию запроса config запроса с корректным AccessToken'ом в хедере.
      accessToken = store.getters.GET_ACCESS_TOKEN
      return AuthUtils.attachAccessTokenToHeader(accessToken, config)
      
    } else {                      //b) access-токен НЕ просрочен. Добавляем его в хедер запроса.
      return AuthUtils.attachAccessTokenToHeader(accessToken, config)
    }
  }
}

export const treatAccessToken = treatAccessTokenInterceptor(store)


//#B. Когда в ответе приходит error_401 или error_403.
const updateTokensInterceptor = (store, http) => async error => {
  let tokenRecoveryPromise = null
  
  console.log('error_for_response.data.message-1', error)
  console.log('error_for_response.data.message-2', error.config)   //СКРЫТОЕ(!) поле у error(!).
  console.log('error_for_response.data.message-3', error.response) //СКРЫТОЕ(!) поле у error(!).  =>
  //error.response = {
  //  config: {url: "auth/basket", method: "delete", headers: {…}, params: {…}, transformRequest: Array(1), …}
  //  data: "Unauthorized"
  //  headers: {connection: "keep-alive", content-length: "12", content-type: "text/plain; charset=utf-8", date: "Sun, 06 Jun 2021 10:29:33 GMT", etag: "W/\"c-dAuDFQrdjS3hezqxDTNgW7AOlYk\"", …}
  //  request: XMLHttpRequest {readyState: 4, timeout: 0, withCredentials: false, upload: XMLHttpRequestUpload, onreadystatechange: ƒ, …}
  //  status: 401
  //  statusText: "Unauthorized"
  //}
  
  
  console.log('ERROR ========')
  console.log('ERROR, error.response.data.message >>>>>>>>>', error.response.data.message)
  //здесь можно дополнительно отрабатывать error.response.data.message, который высылается сервером via res.status(403).send({message: 'refreshToken is wrong'})
  // if (!['Token_expired', 'refreshToken is wrong'].includes(message)) {  //в случае, когда ошибка не связана с валидностью accessToken'a.
  //   return Promise.reject(error)
  // }
  
  if(error.response.status === 401) {   //"для доступа требуется аутентификация".
    //посылаем запрос для восстановления access-токена via refresh-токен.
    tokenRecoveryPromise = store.dispatch('TOUCH_ACCOUNT', {login: '', password: ''})
    await tokenRecoveryPromise
    tokenRecoveryPromise = null
    
    let accessToken = store.getters.GET_ACCESS_TOKEN
    let accessConfig = AuthUtils.attachAccessTokenToHeader(accessToken, error.config)
    
    //заново повторяем неудавшийся запрос, но уже с восстановленным accessToken'ом.
    return http(accessConfig)
  }


  //"есть ограничения в доступе":
  // - Неверный пароль при login'e.
  // - Невалидный access-токен и refresh-токен
  // - Невалидный refresh-токен при перезагрузке.
  if(error.response.status === 403) {
    //Описываем причину для алерта и предлагаем повторно пройти идентификацию.
    console.log('ERROR_403 ========', error.response.data.message)
    
    let clarification = `Access was denied <br>because of <br>${error.response.data.message}`
    store.dispatch('SHOW_CLARIFICATION', clarification)
      .then(() => {
        if(router.currentRoute.path !== '/a11n')   //For avoid redundant navigation to current location "/a11n".
          router.push('/a11n')    //делаем редирект на '/a11n' и показываем алерт с объяснением причины.    // Здесь router - импортирован(!), а не берется из this.$...
      })
  }
}

export const updateTokens = updateTokensInterceptor(store, axios)








