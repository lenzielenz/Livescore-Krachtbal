package be.krachtbal.aantekenaar.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import be.krachtbal.aantekenaar.data.BuildInfo
import be.krachtbal.aantekenaar.data.DEMO_ROLLEN_APP
import be.krachtbal.aantekenaar.data.Graph
import kotlinx.coroutines.launch

/** Invoervelden zoals op de site: paneel, haarlijn, ijsblauwe rand bij focus (`:focus-visible`). */
@Composable
internal fun fieldColors() = OutlinedTextFieldDefaults.colors(
    focusedTextColor = Pal.Text,
    unfocusedTextColor = Pal.Text,
    focusedContainerColor = Pal.Card,
    unfocusedContainerColor = Pal.Card,
    focusedBorderColor = Pal.Accent,
    unfocusedBorderColor = Pal.Line,
    focusedLabelColor = Pal.Accent,
    unfocusedLabelColor = Pal.Dim,
    focusedPlaceholderColor = Pal.Dim,
    unfocusedPlaceholderColor = Pal.Dim,
    cursorColor = Pal.Accent,
)

@Composable
fun LoginScreen() {
    val scope = rememberCoroutineScope()
    var email by rememberSaveable { mutableStateOf(Graph.authRepo.email ?: "") }
    var password by rememberSaveable { mutableStateOf("") }
    var server by rememberSaveable { mutableStateOf(Graph.authRepo.serverUrl) }
    // De federatie-app wordt vooral op een demo-adres gebruikt: het serveradres staat dan altijd open.
    var advanced by rememberSaveable { mutableStateOf(BuildInfo.FEDERATIE) }
    var demoCode by rememberSaveable { mutableStateOf(Graph.authRepo.demoCode ?: "") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    AuroraBackdrop {
        Column(
            Modifier
                .fillMaxSize()
                .safeDrawingPadding()
                .verticalScroll(rememberScrollState())
                .padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            VSpace(24)
            // Merknaam zoals op de site ("Krachtbal Live"): Sora, "Krachtbal" in het ijsblauwe merkverloop.
            Text(
                androidx.compose.ui.text.buildAnnotatedString {
                    withStyle(SpanStyle(brush = AccentGrad)) { append("Krachtbal") }
                    withStyle(SpanStyle(color = Pal.Text)) { append(if (BuildInfo.FEDERATIE) " Federatie" else " Aantekentafel") }
                },
                style = DisplayStyle.merge(TextStyle(fontSize = 28.sp, fontWeight = FontWeight.ExtraBold, textAlign = androidx.compose.ui.text.style.TextAlign.Center)),
                modifier = Modifier.fillMaxWidth(),
            )
            Text(
                if (BuildInfo.FEDERATIE) "De hele wedstrijddag: selectie, controle, aantekenen, aftekenen" else "Log in om wedstrijden aan te tekenen",
                color = Pal.Dim, fontSize = 14.sp,
                textAlign = androidx.compose.ui.text.style.TextAlign.Center, modifier = Modifier.fillMaxWidth(),
            )
            VSpace(4)

            if (BuildInfo.FEDERATIE) {
                SectionTitle("Demo: kijk als …")
                Dim("Kies een rol in de demoruimte, zonder wachtwoord. Vraagt de demo een toegangscode, vul die dan eerst hieronder in.")
                OutlinedTextField(
                    value = server,
                    onValueChange = { server = it },
                    label = { Text("Adres van de demo") },
                    singleLine = true,
                    shape = RoundedCornerShape(Radius.control),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                    colors = fieldColors(),
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = demoCode,
                    onValueChange = { demoCode = it },
                    label = { Text("Toegangscode (als de demo er een vraagt)") },
                    singleLine = true,
                    shape = RoundedCornerShape(Radius.control),
                    colors = fieldColors(),
                    modifier = Modifier.fillMaxWidth(),
                )
                DEMO_ROLLEN_APP.forEach { rol ->
                    SmallButton(
                        label = "${rol.icoon}  ${rol.label}",
                        kind = Btn.Default,
                        enabled = !busy,
                        modifier = Modifier.fillMaxWidth(),
                        onClick = {
                            busy = true
                            error = null
                            scope.launch {
                                Graph.authRepo.loginDemo(server, rol.sleutel, demoCode).fold(
                                    onSuccess = { Graph.onLoggedIn() },
                                    onFailure = { error = it.message ?: "Inloggen mislukt." },
                                )
                                busy = false
                            }
                        },
                    )
                }
                error?.let { Text(it, color = Pal.Bad, fontSize = 14.sp) }
                SectionTitle("Of log in met je eigen account")
            }

            OutlinedTextField(
                value = email,
                onValueChange = { email = it },
                label = { Text("E-mail") },
                singleLine = true,
                shape = RoundedCornerShape(Radius.control),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                colors = fieldColors(),
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = password,
                onValueChange = { password = it },
                label = { Text("Wachtwoord") },
                singleLine = true,
                shape = RoundedCornerShape(Radius.control),
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                colors = fieldColors(),
                modifier = Modifier.fillMaxWidth(),
            )

            if (advanced && !BuildInfo.FEDERATIE) {
                OutlinedTextField(
                    value = server,
                    onValueChange = { server = it },
                    label = { Text("Server") },
                    singleLine = true,
                    shape = RoundedCornerShape(Radius.control),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                    colors = fieldColors(),
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            if (!BuildInfo.FEDERATIE) error?.let { Text(it, color = Pal.Bad, fontSize = 14.sp) }

            SmallButton(
                label = if (busy) "Bezig…" else "Inloggen",
                onClick = {
                    busy = true
                    error = null
                    scope.launch {
                        Graph.authRepo.login(server, email, password).fold(
                            onSuccess = { Graph.onLoggedIn() },
                            onFailure = { error = it.message ?: "Inloggen mislukt." },
                        )
                        busy = false
                    }
                },
                kind = Btn.Primary,
                enabled = !busy && email.isNotBlank() && password.isNotEmpty(),
                modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
            )

            if (!BuildInfo.FEDERATIE) {
                TextButton(onClick = { advanced = !advanced }) {
                    Text(if (advanced) "Server verbergen" else "Geavanceerd (server)", color = Pal.Dim)
                }
            }
        }
    }
}
