//
//  EventTarget.swift
//  finalrun-ios-test
//
//  Created by Ajay S on 17/03/24.
//

import Foundation
import XCTest

struct EventTarget {
    let eventTarget: NSObject
    init(bundleId: String) {
        let application = XCUIApplication(bundleIdentifier: bundleId)
        eventTarget = application.children(matching: .any).firstMatch
            .perform(NSSelectorFromString("eventTarget"))
            .takeUnretainedValue() as! NSObject
    }

    typealias EventBuilder = @convention(block) () -> EventRecord
    func dispatchEvent(description: String, builder: EventBuilder, completion: @escaping SuccessCallBack) {
        let selector = NSSelectorFromString("dispatchEventWithDescription:eventBuilder:error:")
        let imp = eventTarget.method(for: selector)

        typealias EventBuilderObjc = @convention(block) () -> NSObject
        typealias Method = @convention(c) (NSObject, Selector, String, EventBuilderObjc, AutoreleasingUnsafeMutablePointer<NSError?>) -> Bool
        var error: NSError?
        let method = unsafeBitCast(imp, to: Method.self)

        _ = method(
            eventTarget,
            selector,
            description,
            { builder().eventRecord },
            &error
        )

        if let error = error {
            completion(false)
        } else {
            completion(true)
        }
    }
}
