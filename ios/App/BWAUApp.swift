import SwiftUI
import UIKit
import UserNotifications
import WebKit

@main
struct BWAUApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var delegate
    var body: some Scene { WindowGroup { TrainingView() } }
}

final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                withCompletionHandler completion: @escaping (UNNotificationPresentationOptions) -> Void) {
        completion([.banner, .sound])
    }
}

private struct TrainingView: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> TrainingController { TrainingController() }
    func updateUIViewController(_ controller: TrainingController, context: Context) {}
}

final class TrainingController: UIViewController, WKNavigationDelegate, WKScriptMessageHandlerWithReply, WKDownloadDelegate {
    private let home = URL(string: "https://realcrancko.github.io/bwau/")!
    private let timer = PauseController()
    private var web: WKWebView!
    private var downloads: [ObjectIdentifier: URL] = [:]

    override func viewDidLoad() {
        super.viewDidLoad()
        let config = WKWebViewConfiguration()
        config.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: "bwauRest")
        web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = self
        view.backgroundColor = .systemBackground
        view.addSubview(web)
        web.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            web.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            web.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            web.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            web.trailingAnchor.constraint(equalTo: view.trailingAnchor)
        ])
        NotificationCenter.default.addObserver(self, selector: #selector(activate), name: UIApplication.didBecomeActiveNotification, object: nil)
        web.load(URLRequest(url: home))
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        Task {
            let settings = await UNUserNotificationCenter.current().notificationSettings()
            if settings.authorizationStatus == .notDetermined { _ = try? await timer.allowSound() }
        }
    }

    @objc private func activate() {
        timer.submit { [timer] in await timer.clearExpired() }
    }

    private func trusted(_ url: URL?) -> Bool {
        guard let url else { return false }
        return url.scheme == home.scheme && url.host == home.host && (url.port == nil || url.port == 443)
            && url.pathComponents.prefix(2).elementsEqual(["/", "bwau"])
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        let url = action.request.url
        if action.shouldPerformDownload && trusted(webView.url) && (url?.scheme == "blob" || trusted(url)) {
            decisionHandler(.download)
        } else if trusted(url) {
            decisionHandler(.allow)
        } else {
            decisionHandler(.cancel)
            if action.navigationType == .linkActivated, let url, ["https", "http"].contains(url.scheme ?? "") {
                UIApplication.shared.open(url)
            }
        }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        guard (error as NSError).code != NSURLErrorCancelled else { return }
        let alert = UIAlertController(title: "BWAU konnte nicht laden", message: error.localizedDescription, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Erneut versuchen", style: .default) { [weak self] _ in
            guard let self else { return }
            self.web.load(URLRequest(url: self.home))
        })
        present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        download.delegate = self
    }

    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String,
                  completionHandler: @escaping (URL?) -> Void) {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("BWAU-\(UUID().uuidString).csv")
        downloads[ObjectIdentifier(download)] = url
        completionHandler(url)
    }

    func downloadDidFinish(_ download: WKDownload) {
        guard let url = downloads.removeValue(forKey: ObjectIdentifier(download)) else { return }
        let share = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        share.popoverPresentationController?.sourceView = view
        share.completionWithItemsHandler = { _, _, _, _ in try? FileManager.default.removeItem(at: url) }
        present(share, animated: true)
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        if let url = downloads.removeValue(forKey: ObjectIdentifier(download)) { try? FileManager.default.removeItem(at: url) }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage,
                               replyHandler: @escaping (Any?, String?) -> Void) {
        guard message.frameInfo.isMainFrame, trusted(message.frameInfo.request.url),
              let data = message.body as? [String: Any], let action = data["action"] as? String else {
            replyHandler(nil, "Ungültige Anfrage.")
            return
        }
        timer.submit { [self] in
            do {
                switch action {
                case "rest":
                    guard let ms = data["end"] as? Double, ms.isFinite,
                          ms <= Date().addingTimeInterval(86400).timeIntervalSince1970 * 1000 else {
                        replyHandler(nil, "Ungültige Pausenzeit.")
                        return
                    }
                    let label = String((data["label"] as? String ?? "Nächster Satz").prefix(100))
                    try await timer.change(end: Date(timeIntervalSince1970: ms / 1000), label: label)
                    replyHandler(true, nil)
                case "cancel":
                    await timer.clear()
                    replyHandler(true, nil)
                case "test":
                    let result = try await timer.testSound()
                    replyHandler(result, nil)
                case "permission":
                    if try await timer.allowSound() {
                        let settings = await UNUserNotificationCenter.current().notificationSettings()
                        if settings.soundSetting == .enabled {
                            replyHandler("Mitteilungstöne sind erlaubt.", nil)
                            return
                        }
                    }
                    if let url = URL(string: UIApplication.openNotificationSettingsURLString) {
                        _ = await UIApplication.shared.open(url)
                    }
                    replyHandler("Aktiviere Mitteilungen und Töne für BWAU.", nil)
                default:
                    replyHandler(nil, "Unbekannte Aktion.")
                }
            } catch {
                replyHandler(nil, error.localizedDescription)
            }
        }
    }
}
