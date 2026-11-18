import ActivityKit
import Foundation
import UserNotifications

@MainActor
final class PauseController {
    private let center = UNUserNotificationCenter.current()
    private let restID = "bwau.pause"
    private var expiration: Task<Void, Never>?
    private var deadline: Date?
    // WebKit can deliver an edit or cancellation before a previous update finishes.
    private var tail: Task<Void, Never>?

    func submit(_ action: @escaping @MainActor () async -> Void) {
        let previous = tail
        tail = Task {
            await previous?.value
            await action()
        }
    }

    func change(end: Date, label: String) async throws {
        expiration?.cancel()
        guard end > Date() else { await clear(); return }
        deadline = end
        let state = RestAttributes.ContentState(start: Date(), end: end, label: label)
        let content = ActivityContent(state: state, staleDate: end)
        var activityError: Error?
        if ActivityAuthorizationInfo().areActivitiesEnabled {
            let activities = Activity<RestAttributes>.activities
            if let first = activities.first {
                await first.update(content)
                for extra in activities.dropFirst() { await extra.end(nil, dismissalPolicy: .immediate) }
            } else {
                do { _ = try Activity.request(attributes: RestAttributes(), content: content, pushType: nil) }
                catch { activityError = error }
            }
        }
        let interval = end.timeIntervalSinceNow
        guard interval > 0 else { await clear(); return }
        expiration = Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(interval * 1_000_000_000))
            guard !Task.isCancelled, let self else { return }
            self.submit { [weak self] in await self?.clearExpired() }
        }
        let settings = await center.notificationSettings()
        switch settings.authorizationStatus {
        case .authorized, .provisional, .ephemeral:
            if end > Date() { try await notify(at: end, id: restID, body: label) }
        default: break
        }
        if let activityError { throw activityError }
    }

    func clearExpired() async {
        if let deadline, deadline <= Date() {
            // Let a due notification finish being delivered.
            await clear(cancelAlert: false)
        } else if deadline == nil {
            for activity in Activity<RestAttributes>.activities where activity.content.state.end <= Date() {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
        }
    }

    func clear(cancelAlert: Bool = true) async {
        expiration?.cancel()
        expiration = nil
        deadline = nil
        if cancelAlert { center.removePendingNotificationRequests(withIdentifiers: [restID]) }
        for activity in Activity<RestAttributes>.activities {
            await activity.end(nil, dismissalPolicy: .immediate)
        }
    }

    func allowSound() async throws -> Bool {
        try await center.requestAuthorization(options: [.alert, .sound])
    }

    func testSound() async throws -> String {
        guard try await allowSound() else { return "Erlaube BWAU-Mitteilungen in den iPhone-Einstellungen." }
        try await notify(at: Date().addingTimeInterval(10), id: "bwau.test", body: "Der BWAU-Pausenton ist eingerichtet.")
        return "Test in 10 Sekunden. Du kannst das iPhone sperren."
    }

    private func notify(at end: Date, id: String, body: String) async throws {
        let content = UNMutableNotificationContent()
        content.title = id == restID ? "Pause vorbei" : "BWAU · Tontest"
        content.body = body
        content.sound = .default
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: max(0.1, end.timeIntervalSinceNow), repeats: false)
        try await center.add(UNNotificationRequest(identifier: id, content: content, trigger: trigger))
    }
}
