import ActivityKit
import Foundation

struct RestAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        let start: Date
        let end: Date
        let label: String
    }
}
