import WidgetKit
import SwiftUI

struct HazemateEntry: TimelineEntry {
    let date: Date
    let psi: Int?
    let temperature: Double?
    let humidity: Double?
    let region: String
}

struct HazemateProvider: TimelineProvider {
    func placeholder(in context: Context) -> HazemateEntry {
        .init(date: .now, psi: 56, temperature: 30, humidity: 74, region: "Central")
    }

    func getSnapshot(in context: Context, completion: @escaping (HazemateEntry) -> Void) {
        completion(placeholder(in: context))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<HazemateEntry>) -> Void) {
        // Replace with a URLSession call to https://YOUR_DOMAIN/api/environment
        let entry = placeholder(in: context)
        completion(Timeline(entries: [entry], policy: .after(.now.addingTimeInterval(15 * 60))))
    }
}

struct HazemateWidgetView: View {
    var entry: HazemateProvider.Entry

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Hazemate").font(.headline)
            Text(entry.region).font(.caption).foregroundStyle(.secondary)
            HStack {
                VStack(alignment: .leading) {
                    Text("PSI").font(.caption2)
                    Text(entry.psi.map(String.init) ?? "—").font(.title2).bold()
                }
                Spacer()
                VStack(alignment: .trailing) {
                    Text(entry.temperature.map { String(format: "%.0f°C", $0) } ?? "—")
                    Text(entry.humidity.map { String(format: "%.0f%%", $0) } ?? "—")
                }.font(.caption)
            }
        }
        .containerBackground(.fill.tertiary, for: .widget)
    }
}

struct HazemateWidget: Widget {
    let kind = "HazemateWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: HazemateProvider()) { entry in
            HazemateWidgetView(entry: entry)
        }
        .configurationDisplayName("Hazemate")
        .description("Haze, temperature and humidity at a glance.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
