import ActivityKit
import SwiftUI
import WidgetKit

@main
struct PauseWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: RestAttributes.self) { context in
            HStack(spacing: 14) {
                Image(systemName: "timer").font(.title)
                VStack(alignment: .leading) {
                    Text(context.isStale ? "Pause vorbei" : "BWAU · Satzpause").font(.headline)
                    Text(context.state.label).font(.subheadline).lineLimit(1)
                }
                Spacer()
                remaining(context).font(.title2.bold())
            }
            .padding()
            .activityBackgroundTint(.black)
            .foregroundStyle(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) { Label("BWAU", systemImage: "timer") }
                DynamicIslandExpandedRegion(.trailing) { remaining(context) }
                DynamicIslandExpandedRegion(.bottom) { Text(context.state.label).lineLimit(1) }
            } compactLeading: {
                Image(systemName: "timer")
            } compactTrailing: {
                remaining(context).frame(maxWidth: 52)
            } minimal: {
                Image(systemName: context.isStale ? "checkmark" : "timer")
            }
        }
    }

    @ViewBuilder
    private func remaining(_ context: ActivityViewContext<RestAttributes>) -> some View {
        if context.isStale {
            Image(systemName: "checkmark").accessibilityLabel("Pause vorbei")
        } else {
            Text(timerInterval: context.state.start...context.state.end, countsDown: true)
                .monospacedDigit().multilineTextAlignment(.trailing)
        }
    }
}
