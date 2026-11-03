# R8-regels voor de release-build (verkleinen + verduisteren). Bibliotheken (OkHttp, Compose, coroutines) leveren hun
# eigen consumer-regels mee; hier staat enkel wat de app zelf nodig heeft.

# kotlinx.serialization: de gegenereerde serializers van onze @Serializable-klassen worden via reflectie-achtige
# opzoeking (Companion.serializer()) gevonden. Zonder deze regels kan R8 ze wegsnoeien of hernoemen en faalt het
# decoderen van elk serverantwoord pas op de telefoon. (Standaardregels uit de kotlinx.serialization-documentatie.)
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt

-keepclassmembers @kotlinx.serialization.Serializable class ** {
    *** Companion;
    *** INSTANCE;
    kotlinx.serialization.KSerializer serializer(...);
}
-if @kotlinx.serialization.Serializable class **
-keepclassmembers class <1> {
    static <1>$Companion Companion;
}
-if @kotlinx.serialization.Serializable class ** {
    static **$* *;
}
-keepclassmembers class <2>$<3> {
    kotlinx.serialization.KSerializer serializer(...);
}

# Leesbare stacktraces in een crashmelding: bewaar bestandsnamen en regelnummers (het mapping-bestand zet ze terug).
-keepattributes SourceFile, LineNumberTable
-renamesourcefileattribute SourceFile
