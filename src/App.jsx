// import { useState } from 'react'
import 'bootstrap/dist/css/bootstrap.min.css'
import {BrowserRouter, Routes, Route} from 'react-router-dom'

import Signup from './Signup'
import Login from './Login'
import Home from './Home'
import Testchat from './TestChat'
import ProtectedRoute from './components/ProtectedRoute';


function App() {

  return (
    <BrowserRouter>
      <Routes>
        <Route path='/register' element={<Signup/>}/>
        <Route path='/login' element={<Login/>}/>
        <Route element={<ProtectedRoute />}>
          <Route path="/home" element={<Home />} />
          <Route path="/testchat" element={<Testchat />} />
        </Route>
		
      </Routes>
    </BrowserRouter>
  )
}

export default App
