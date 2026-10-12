package com.deltabots.pulse.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.deltabots.pulse.data.repo.SessionRepository
import com.deltabots.pulse.network.ApiException
import kotlinx.coroutines.launch
import org.koin.compose.koinInject

@Composable
fun AuthScreen(onDone: () -> Unit) {
    val session: SessionRepository = koinInject()
    val scope = rememberCoroutineScope()
    var register by remember { mutableStateOf(false) }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var name by remember { mutableStateOf("") }
    var mfa by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(if (register) "Criar conta" else "Entrar", style = MaterialTheme.typography.headlineMedium)
        if (register) OutlinedTextField(name, { name = it }, Modifier.fillMaxWidth(), label = { Text("Nome") }, singleLine = true)
        OutlinedTextField(email, { email = it.trim() }, Modifier.fillMaxWidth(), label = { Text("E-mail") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email))
        OutlinedTextField(password, { password = it }, Modifier.fillMaxWidth(), label = { Text("Senha (mín. 12 caracteres)") }, singleLine = true, visualTransformation = PasswordVisualTransformation(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password))
        if (!register) OutlinedTextField(mfa, { mfa = it.filter(Char::isDigit).take(6) }, Modifier.fillMaxWidth(), label = { Text("Código MFA (se ativado)") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        Button(enabled = !busy && email.isNotBlank() && password.length >= 12, onClick = {
            busy = true; error = null
            scope.launch {
                try {
                    if (register) session.register(email, password, name) else session.login(email, password, mfa)
                    onDone()
                } catch (e: ApiException) {
                    error = when (e.code) {
                        "MFA_REQUIRED" -> "Informe o código MFA."
                        "INVALID_CREDENTIALS" -> "E-mail ou senha incorretos."
                        else -> "${e.message} (${e.code})"
                    }
                } catch (e: Exception) {
                    error = "Sem conexão com o servidor. Verifique a internet e tente de novo."
                } finally { busy = false }
            }
        }) { Text(if (busy) "Aguarde…" else if (register) "Criar conta" else "Entrar") }
        TextButton({ register = !register; error = null }) { Text(if (register) "Já tenho conta" else "Criar conta") }
    }
}
