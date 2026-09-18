package com.hazemate.widget

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.glance.GlanceId
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.provideContent
import androidx.glance.layout.Column
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import androidx.compose.ui.graphics.Color

class HazemateWidget : GlanceAppWidget() {
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        // Phase 2: fetch https://YOUR_DOMAIN/api/environment using the preferred coarse region.
        provideContent { Content() }
    }

    @Composable
    private fun Content() {
        Column {
            Text("Hazemate", style = TextStyle(fontWeight = FontWeight.Bold))
            Text("Central Singapore", style = TextStyle(color = ColorProvider(Color.Gray)))
            Text("PSI 56 · 30°C · 74%")
        }
    }
}

class HazemateWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = HazemateWidget()
}
